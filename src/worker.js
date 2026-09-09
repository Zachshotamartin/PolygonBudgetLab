import { simplifyMesh } from './decimate.js';
self.onmessage=event=>{
  const {id,mesh,target,preserveBoundary}=event.data;
  try {const result=simplifyMesh(mesh,target,{preserveBoundary});self.postMessage({id,result},[result.positions.buffer,result.indices.buffer]);}
  catch(error){self.postMessage({id,error:error.message});}
};
