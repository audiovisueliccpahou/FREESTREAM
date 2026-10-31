import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { store } from '../regie/core.js';
import { searchAll, invalidateSearchIndex } from '../regie/quick-search.js';

const bible = {
  _meta: { id:'test-fr', name:'Bible de test', short:'TEST', lang:'fr' },
  books: { Esther:{ '8':{ '9':'Les secrétaires du roi furent appelés en ce temps-là.' } },
    Jean:{ '3':{ '16':'Car Dieu a tant aimé le monde.' } } },
};
const song = { id:'chant-test', title:'Dieu est fidèle', sections:[
  { label:'Refrain', lines:['Tu es fidèle, Seigneur','Ton amour demeure'] },
] };
let oldState, oldList, oldLoad;

beforeEach(() => {
  oldState = store.state; oldList = store.list; oldLoad = store.load;
  store.state = { ...oldState, bible:{ ...oldState.bible, version:'test-fr' }, medias:{ ...oldState.medias, links:[{id:'yt1',name:'Culte en direct',url:'https://example.invalid'}] } };
  store.list = async folder => folder==='bibles' ? [{name:'test-fr.json'}]
    : folder==='chants' ? [{name:'chant-test.json'}]
    : folder==='medias' ? [{name:'fond-adoration.jpg',size:12}] : [];
  store.load = async (_folder, name) => name==='test-fr.json' ? bible : song;
  invalidateSearchIndex();
});
afterEach(() => { store.state=oldState; store.list=oldList; store.load=oldLoad; invalidateSearchIndex(); });

describe('Recherche unifiée — prépare, ne diffuse pas', () => {
  test('référence Bible exacte et texte local', async () => {
    const rows = await searchAll('Esther 8:9');
    const item = rows.find(x=>x.type==='bible');
    assert.ok(item);
    assert.equal(item.title,'Esther 8:9');
    assert.match(item.detail,/secrétaires du roi/);
    assert.deepEqual(item.action,{book:'Esther',chapter:8,verse:9,toVerse:null});
  });

  test('recherche textuelle Bible tolérante aux accents', async () => {
    const rows = await searchAll('aime le monde');
    assert.ok(rows.some(x=>x.type==='bible' && x.title==='Jean 3:16'));
  });

  test('recherche dans le titre et les paroles des chants', async () => {
    const title = await searchAll('fidèle');
    assert.ok(title.some(x=>x.type==='song' && x.action.id==='chant-test'));
    const lyric = await searchAll('amour demeure');
    assert.ok(lyric.some(x=>x.type==='song' && x.detail.includes('paroles')));
  });

  test('recherche fichiers et liens médias', async () => {
    const file = await searchAll('adoration');
    assert.ok(file.some(x=>x.type==='media' && x.action.id==='f:fond-adoration.jpg'));
    const link = await searchAll('direct');
    assert.ok(link.some(x=>x.type==='media' && x.action.id==='l:yt1'));
    assert.match(link.find(x=>x.type==='media').detail,/2 clics OBS/);
  });

  test('saisie courte ne lance ni recherche lourde ni diffusion', async () => {
    assert.deepEqual(await searchAll('x'),[]);
    assert.deepEqual(await searchAll('zz'),[]);
    assert.equal(store.state.live,oldState.live,'la recherche ne touche pas au direct');
  });
});
