// Format checking is not identity verification. Never log or persist this input.
export function todayInStockholm(date=new Date()) {
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function parsePersonalNumber(value,asOf=todayInStockholm()) {
 if(typeof value!=='string')return {valid:false,code:'format'};
 const match=/^(\d{8})[- ]?(\d{4})$/.exec(value.trim());
 if(!match)return {valid:false,code:'format'};
 const number=match[1]+match[2],year=Number(number.slice(0,4)),month=Number(number.slice(4,6)),day=Number(number.slice(6,8));
 if(day>=61&&day<=91)return {valid:false,code:'coordination_number'};
 const date=new Date(Date.UTC(year,month-1,day));
 if(year<1800||date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return {valid:false,code:'date'};
 const current=/^(\d{4})-(\d{2})-(\d{2})$/.exec(asOf);
 if(!current)throw Error('Expected an ISO calendar date');
 const [,cy,cm,cd]=current.map(Number);
 if(Date.UTC(year,month-1,day)>Date.UTC(cy,cm-1,cd))return {valid:false,code:'future'};
 const digits=number.slice(2).split('').map(Number);
 const sum=digits.reduce((total,n,i)=>{const v=n*(i%2===0?2:1);return total+Math.floor(v/10)+v%10;},0);
 if(sum%10!==0)return {valid:false,code:'checksum'};
 const age=cy-year-((cm<month||(cm===month&&cd<day))?1:0);
 const legalGender=Number(number.at(-2))%2===0?'woman':'man';
 return {valid:true,age,legalGender,eligible:age>=16,ageBand:age<16?null:age<18?'16-17':age<30?'18-29':age<50?'30-49':age<65?'50-64':'65+'};
}
