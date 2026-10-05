import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
if(scripts.length!==1)throw new Error('Expected one inline application script.');
new vm.Script(scripts[0],{filename:'index.html inline script'});
for(const id of ['dashboard','materials','add','learn','correction','review','speaking']){
  if(!new RegExp(`<section id="${id}" class="page(?: active)?">`).test(html))throw new Error(`Missing page: ${id}`);
}
for(const id of ['syncStatus','dashboardToLearning','dashboardToSpeaking']){
  if(!html.includes(`id="${id}"`))throw new Error(`Dashboard control missing: ${id}`);
}
if(html.includes('id="mobileAddress"'))throw new Error('Removed Cloud Sync explanation card remains.');
for(const id of ['speakingLesson','prepareSpeakingBrief','speakingBriefPreview','copySpeakingV2Brief']){
  if(!html.includes(`id="${id}"`))throw new Error(`Speaking V2 Phase 1 control missing: ${id}`);
}
for(const id of ['speakingReportInput','saveSpeakingReport','speakingReportStatus','speakingReportList']){
  if(!html.includes(`id="${id}"`))throw new Error(`Speaking report inbox control missing: ${id}`);
}
if(!html.includes('schemaVersion:"2.1"'))throw new Error('Speaking V2 Brief schema missing.');
for(const required of ['function speakingTargetPlan','neverInventOutOfBriefTarget:true','onlyReliableIndependentLearnerProductionCounts:true','confirmImplausibleOrAmbiguousTranscriptFirst:true','grammarTargetsOptionalForSessionEnding:true','priorityOverReadySignalsAndProgression:true','everyChangedContentWordNeedsReason:true']){
  if(!html.includes(required))throw new Error(`Speaking Coach behavior missing: ${required}`);
}
for(const legacy of ['/functions/v1/speaking-queue','function parseSpeakingReport','function prepareSpeakingQueue','function importSpeakingReportText','copySpeakingBrief','importSpeakingReport']){
  if(html.includes(legacy))throw new Error(`Legacy Speaking flow remains: ${legacy}`);
}
fs.mkdirSync(path.join(root,'public'),{recursive:true});
fs.writeFileSync(path.join(root,'public/index.html'),html);
console.log('Build passed: application syntax, page structure, Speaking Brief, and report inbox verified.');
