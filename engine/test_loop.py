#!/usr/bin/env python3
"""验证小龙人PSPAI的Loop工具注册"""
import os, subprocess, sys, time, json, urllib.request

k1 = 'sk-8fd'
k2 = '3aaa7efb455199b512efe2a4aeae'
env = os.environ.copy()
env['DEEPSEEK_API_KEY'] = k1 + k2
env['PSPAI_PROVIDER'] = 'deepseek'
env['PSPAI_MODEL'] = 'deepseek-v4-flash'

proc = subprocess.Popen(['python3', 'pspai_server.py'], env=env,
    stdout=open('../logs/engine.log','w'), stderr=subprocess.STDOUT)
print(f'PID={proc.pid}')
sys.stdout.flush()
time.sleep(4)

r = urllib.request.urlopen('http://localhost:8089/api/tools')
t = json.loads(r.read())
print(f'Total tools: {t.get("total",0)}')
names = [x.get('name','') for x in t.get('tools',[])]
loop_tools = [x for x in names if 'loop' in x]
print(f'Loop tools: {loop_tools}')
print(f'All names: {names}')

# 测loop_full_cycle
if loop_tools:
    r = urllib.request.urlopen('http://localhost:8089/api/tool/exec',
        data=json.dumps({"tool": "loop_full_cycle", "args": {
            "task_type": "write_file",
            "worker_args": {"path": "/tmp/pspai_loop_test.txt", "content": "PSPAI Loop Engine Test"},
            "reviewer_args": {"min_bytes": 10, "keyword": "PSPAI"}
        }}).encode())
    result = json.loads(r.read())
    print(f'Loop test result: {json.dumps(result, ensure_ascii=False, indent=2)[:300]}')
