import {mkdirSync,copyFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),out=join(root,'.public');
const files=['index.html','login.html','dashboard.html','vote.html','principer.html','complete.html','privacy.html','favicon.png','styles.css','mobile.css','auth.css','research.css','design-system.css','entry.css','entry.js','categories.js','research-panel.js','auth-client.js','account-session.js','complete.js','public-config.js','vote-page.js','worker/src/research.js','worker/src/geography.js','worker/src/personal-number.js','data/research-catalog.json','data/research-releases/index.json'];
const releases=join(root,'data/research-releases');
for(const name of readdirSync(releases))if(/^release-\d{4}-\d{2}-\d{2}\.json$/.test(name))files.push('data/research-releases/'+name);
function inspect(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const path=join(dir,e.name);if(e.isDirectory())inspect(path);else if(!files.includes(relative(out,path).replaceAll('\\','/')))throw Error('Unexpected build asset: '+e.name);}}
mkdirSync(out,{recursive:true});inspect(out);
for(const file of files){const target=join(out,file);mkdirSync(dirname(target),{recursive:true});copyFileSync(join(root,file),target);}
console.log('Prepared '+files.length+' allowlisted public assets; no account data or secrets copied.');
