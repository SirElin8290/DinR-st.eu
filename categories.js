// The same eight visual identities are used on the entry page and question cards.
export const CATEGORIES = Object.freeze([
 {id:'energy',label:'Energi & klimat',color:'#14735a',tint:'#e9f4ef'},
 {id:'school',label:'Skola & utbildning',color:'#976500',tint:'#fff5dd'},
 {id:'health',label:'Vård & omsorg',color:'#b4426c',tint:'#fbeef3'},
 {id:'safety',label:'Lag & trygghet',color:'#355ed8',tint:'#edf2ff'},
 {id:'economy',label:'Ekonomi & arbete',color:'#a65324',tint:'#fff0e5'},
 {id:'democracy',label:'Demokrati & samhälle',color:'#7650bf',tint:'#f3eefc'},
 {id:'housing',label:'Bostäder & infrastruktur',color:'#54647c',tint:'#edf0f5'},
 {id:'world',label:'Sverige & omvärlden',color:'#06717b',tint:'#e9f6f7'}
]);
export function categoryStyle(element,category){
 element.dataset.category=category.id;
 element.style.setProperty('--category-color',category.color);
 element.style.setProperty('--category-tint',category.tint);
}
