export function d1(db){
 function statement(sql,values=[]){return {sql,values,bind(...args){return statement(sql,args);},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},runSync(){const result=db.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)},success:true};},async run(){return this.runSync();}};}
 return {prepare:sql=>statement(sql),async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.runSync());db.exec('COMMIT');return results;}catch(error){db.exec('ROLLBACK');throw error;}}};
}
