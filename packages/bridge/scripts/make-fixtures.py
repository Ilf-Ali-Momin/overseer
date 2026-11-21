# Generates synthetic fixtures that copy the REAL line structure found in ~/.claude/projects
# (see docs/ARCHITECTURE.md section 1). All values are fake.
import json, os, sys
root = sys.argv[1]
V = '2.1.317'
CWD = '/Users/dev/demo-app'
PROJ = os.path.join(root, 'projects', '-Users-dev-demo-app')
os.makedirs(PROJ, exist_ok=True)

class Session:
    def __init__(self, sid, agent_id=None, t0='2026-11-20T10:00:00.000Z'):
        self.sid, self.agent_id, self.lines, self.n, self.parent = sid, agent_id, [], 0, None
        from datetime import datetime, timezone
        self.t = datetime.fromisoformat(t0.replace('Z', '+00:00'))
    def ts(self, step=2):
        from datetime import timedelta
        self.t += timedelta(seconds=step)
        return self.t.strftime('%Y-%m-%dT%H:%M:%S.') + f'{self.t.microsecond // 1000:03d}Z'
    def uid(self):
        self.n += 1
        pre = (self.agent_id or self.sid)[:8]
        return f'{pre}-0000-4000-8000-{self.n:012d}'
    def base(self, typ, step=2):
        u = self.uid()
        o = {'parentUuid': self.parent, 'isSidechain': self.agent_id is not None, 'userType': 'external',
             'cwd': CWD, 'sessionId': self.sid, 'version': V, 'gitBranch': 'main', 'slug': 'demo-slug',
             'type': typ, 'uuid': u, 'timestamp': self.ts(step), 'entrypoint': 'claude-desktop'}
        if self.agent_id: o['agentId'] = self.agent_id
        self.parent = u
        return o
    def raw(self, o): self.lines.append(json.dumps(o))
    def noise(self):
        self.raw({'type': 'queue-operation', 'operation': 'enqueue', 'timestamp': self.ts(0), 'sessionId': self.sid, 'content': 'fake'})
        a = self.base('attachment', 0); a['parentUuid'] = None
        a['attachment'] = {'type': 'hook_success', 'hookName': 'SessionStart', 'content': 'fake hook output'}
        self.raw(a)
    def prompt(self, text):
        o = self.base('user'); o['promptId'] = 'prompt-1'
        o['message'] = {'role': 'user', 'content': text}; self.raw(o)
    def assistant(self, mid, block, stop='tool_use', out=40, **extra):
        o = self.base('assistant', 1)
        o['requestId'] = 'req_fake_' + mid
        o['message'] = {'id': mid, 'type': 'message', 'role': 'assistant', 'model': 'claude-opus-5-5',
                        'content': [block], 'stop_reason': stop, 'stop_sequence': None,
                        'usage': {'input_tokens': 3, 'cache_creation_input_tokens': 1200,
                                  'cache_read_input_tokens': 20000, 'output_tokens': out, 'service_tier': 'standard'}}
        o.update(extra); self.raw(o)
    def thinking(self, mid): self.assistant(mid, {'type': 'thinking', 'thinking': '', 'signature': 'fake-signature'})
    def text(self, mid, text, stop='end_turn'): self.assistant(mid, {'type': 'text', 'text': text}, stop)
    def tool(self, mid, tid, name, inp): self.assistant(mid, {'type': 'tool_use', 'id': tid, 'name': name, 'input': inp, 'caller': {'type': 'direct'}})
    def result(self, tid, content, is_error=None, tur=None):
        o = self.base('user', 3)
        b = {'tool_use_id': tid, 'type': 'tool_result', 'content': content}
        if is_error is not None: b['is_error'] = is_error
        o['message'] = {'role': 'user', 'content': [b]}
        o['toolUseResult'] = tur if tur is not None else content
        o['sourceToolAssistantUUID'] = 'fake'
        self.raw(o)
    def system(self, subtype, **extra):
        o = self.base('system', 0); o['subtype'] = subtype; o['level'] = 'info'; o.update(extra); self.raw(o)
    def write(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'w').write('\n'.join(self.lines) + '\n')

def bash_tur(out, err=''): return {'stdout': out, 'stderr': err, 'interrupted': False, 'isImage': False, 'noOutputExpected': False}

# 1. normal session
s = Session('11111111-1111-4111-8111-111111111111')
s.noise()
s.raw({'type': 'custom-title', 'customTitle': 'Add dark mode toggle', 'sessionId': s.sid})
s.raw({'type': 'mode', 'mode': 'default', 'sessionId': s.sid})
s.prompt('Add a dark mode toggle to the settings page.')
s.thinking('msg_n1'); s.text('msg_n1', 'I will look at the settings page first.', 'tool_use')
s.tool('msg_n1', 'toolu_n_read', 'Read', {'file_path': CWD + '/src/settings.tsx'})
s.result('toolu_n_read', '1\texport function Settings() {}', tur={'type': 'text', 'file': {'filePath': CWD + '/src/settings.tsx', 'numLines': 1}})
s.tool('msg_n2', 'toolu_n_grep', 'Grep', {'pattern': 'theme', 'path': CWD + '/src'})
s.result('toolu_n_grep', 'src/theme.ts')
s.tool('msg_n3', 'toolu_n_edit', 'Edit', {'file_path': CWD + '/src/settings.tsx', 'old_string': 'fake old', 'new_string': 'fake new'})
s.result('toolu_n_edit', 'The file has been updated.', tur={'filePath': CWD + '/src/settings.tsx', 'structuredPatch': [], 'userModified': False})
s.tool('msg_n4', 'toolu_n_bash', 'Bash', {'command': 'pnpm test', 'description': 'Run tests'})
s.result('toolu_n_bash', 'Tests  12 passed (12)', is_error=False, tur=bash_tur('Tests  12 passed (12)'))
s.text('msg_n5', 'Done. The settings page now has a dark mode toggle.')
s.system('stop_hook_summary', hookCount=1, hookInfos=[], hookErrors=[], preventedContinuation=False, stopReason='', hasOutput=False)
s.write(os.path.join(PROJ, s.sid + '.jsonl'))

# 2. session with a subagent
p = Session('22222222-2222-4222-8222-222222222222', t0='2026-11-20T11:00:00.000Z')
p.noise()
p.prompt('Find every TODO in the repo and summarise them.')
p.thinking('msg_p1')
p.tool('msg_p1', 'toolu_p_agent', 'Agent', {'description': 'Scan TODOs', 'prompt': 'fake prompt', 'subagent_type': 'Explore', 'run_in_background': False})
c = Session(p.sid, agent_id='a0c0ffee00000000b', t0='2026-11-20T11:00:05.000Z')
c.prompt('fake prompt')
c.tool('msg_c1', 'toolu_c_grep', 'Grep', {'pattern': 'TODO', 'path': CWD})
c.result('toolu_c_grep', 'src/a.ts\nsrc/b.ts')
c.tool('msg_c2', 'toolu_c_read', 'Read', {'file_path': CWD + '/src/a.ts'})
c.result('toolu_c_read', '1\t// TODO: fake')
c.text('msg_c3', 'Found 2 TODOs in src/a.ts and src/b.ts.')
c.write(os.path.join(PROJ, p.sid, 'subagents', 'agent-' + c.agent_id + '.jsonl'))
json.dump({'agentType': 'Explore', 'description': 'Scan TODOs', 'toolUseId': 'toolu_p_agent', 'spawnDepth': 1,
           'requestShape': 'foreground', 'requestNonInteractive': True},
          open(os.path.join(PROJ, p.sid, 'subagents', 'agent-' + c.agent_id + '.meta.json'), 'w'), indent=2)
p.t = c.t
p.result('toolu_p_agent', [{'type': 'text', 'text': 'Found 2 TODOs in src/a.ts and src/b.ts.'}])
p.text('msg_p2', 'There are 2 TODOs, both in src/.')
p.system('stop_hook_summary', hookCount=0, hookInfos=[], hookErrors=[], preventedContinuation=False, stopReason='', hasOutput=False)
p.write(os.path.join(PROJ, p.sid + '.jsonl'))

# 3. session with errors and odd lines
e = Session('33333333-3333-4333-8333-333333333333', t0='2026-11-20T12:00:00.000Z')
e.noise()
e.raw({'type': 'some-future-line-type', 'sessionId': e.sid, 'foo': 1})
e.prompt('Fix the failing build.')
e.tool('msg_e1', 'toolu_e_bash1', 'Bash', {'command': 'pnpm test', 'description': 'Run tests'})
e.result('toolu_e_bash1', 'Exit code 1\nTests  2 failed | 10 passed (12)', is_error=True, tur='Error: Exit code 1')
e.tool('msg_e2', 'toolu_e_read', 'Read', {'file_path': CWD + '/missing.ts'})
e.result('toolu_e_read', '<tool_use_error>File does not exist.</tool_use_error>', is_error=True, tur='Error: File does not exist.')
e.system('api_error', level='error', error={'status': 529}, retryInMs=2000, retryAttempt=1, maxRetries=10)
e.assistant('msg_e3', {'type': 'text', 'text': 'API Error: overloaded'}, 'stop_sequence', isApiErrorMessage=True, error='overloaded')
e.tool('msg_e4', 'toolu_e_ask', 'AskUserQuestion', {'questions': [{'question': 'Which fix?', 'header': 'Fix', 'options': [{'label': 'A', 'description': 'a'}, {'label': 'B', 'description': 'b'}], 'multiSelect': False}]})
e.lines.append('{"type":"assistant","uuid":"broken-line-not-json')
e.write(os.path.join(PROJ, e.sid + '.jsonl'))
print('ok')
