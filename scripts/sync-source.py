import json,sys,os,subprocess,base64
credential=json.loads(sys.stdin.readline())
env=os.environ.copy()
env['GIT_TERMINAL_PROMPT']='0'
if credential.get('token'):
 env.update({'GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'http.extraHeader','GIT_CONFIG_VALUE_0':'Authorization: Bearer '+credential['token']})
def run(args,**kw):
 r=subprocess.run(args,env=env,text=True,capture_output=True,**kw)
 if r.returncode:
  err=r.stderr
  if credential.get('token'):err=err.replace(credential['token'],'[redacted]')
  print(err,file=sys.stderr);sys.exit(r.returncode)
 return r.stdout.strip()
run(['git','init','-b',credential.get('branch','main')])
run(['git','config','user.name','Codex'])
run(['git','config','user.email','codex@openai.com'])
remote=run(['git','remote'])
run(['git','remote','set-url' if 'origin' in remote.splitlines() else 'add','origin',credential['remote_url']])
run(['git','add','.'])
r=subprocess.run(['git','diff','--cached','--quiet'],env=env)
if r.returncode:run(['git','commit','-m','Build Black Owl menu hub with shared revision history'])
run(['git','push','-u','origin','HEAD:'+credential.get('branch','main')],timeout=120)
print(json.dumps({'commit_sha':run(['git','rev-parse','HEAD'])}))
