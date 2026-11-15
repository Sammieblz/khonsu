// Compile the actual renderer and its generated bounds once for browser suites.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const ts=createRequire(new URL('../apps/web/package.json',import.meta.url))('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const asModule=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

export async function browserDisplayModules(){
  const modules={};
  modules['generated-limits.js']=compile(await readFile(new URL('../apps/web/src/lib/api/generated-limits.ts',import.meta.url),'utf8'));
  for(const name of ['display','displayRenderer','display.worker']){
    modules[`${name}.js`]=compile(await readFile(new URL(`../apps/web/src/features/viewer/${name}.ts`,import.meta.url),'utf8'))
      .replaceAll("'./display'","'./display.js'").replaceAll("'./display.worker.ts'","'./display.worker.js'")
      .replaceAll("'../../lib/api/generated-limits.ts'","'./generated-limits.js'");
  }
  return modules;
}

export async function standaloneDisplayModule(){
  const modules=await browserDisplayModules();
  return asModule(modules['display.js'].replaceAll('./generated-limits.js',asModule(modules['generated-limits.js'])));
}
