// Badaland katalogu — Unity tarafindaki CharacterCatalog / CosmeticCatalog
// ile ID'ler birebir ayni olmalidir.

export interface CharacterDef {
  id: string;
  name: string;
  price: number; // 0 = ucretsiz, herkes kullanabilir
}

export interface ItemDef {
  id: string;
  name: string;
  slot: 'sapka' | 'gozluk' | 'sirt';
  price: number;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'tilki', name: 'Tilki', price: 0 },
  { id: 'tavsan', name: 'Tavşan', price: 0 },
  { id: 'baykus', name: 'Baykuş', price: 300 },
  { id: 'penguen', name: 'Penguen', price: 300 },
  { id: 'domuz', name: 'Domuzcuk', price: 300 },
  { id: 'sincap', name: 'Sincap', price: 400 },
  { id: 'kirpi', name: 'Kirpi', price: 400 },
  { id: 'kurt', name: 'Kurt', price: 500 },
  { id: 'kartal', name: 'Kartal', price: 500 },
  { id: 'flamingo', name: 'Flamingo', price: 600 },
  { id: 'aksolotl', name: 'Aksolotl', price: 800 },
  { id: 'geyik', name: 'Geyik', price: 800 },
];

export const ITEMS: ItemDef[] = [
  { id: 'sapka_parti', name: 'Parti Şapkası', slot: 'sapka', price: 100 },
  { id: 'sapka_kovboy', name: 'Kovboy Şapkası', slot: 'sapka', price: 200 },
  { id: 'sapka_tac', name: 'Altın Taç', slot: 'sapka', price: 500 },
  { id: 'gozluk_kare', name: 'Kare Gözlük', slot: 'gozluk', price: 100 },
  { id: 'gozluk_pilot', name: 'Pilot Gözlüğü', slot: 'gozluk', price: 250 },
  { id: 'sirt_canta', name: 'Sırt Çantası', slot: 'sirt', price: 150 },
  { id: 'sirt_roket', name: 'Roket Çantası', slot: 'sirt', price: 600 },
];

export function findCharacter(id: string): CharacterDef | undefined {
  return CHARACTERS.find(c => c.id === id);
}

export function findItem(id: string): ItemDef | undefined {
  return ITEMS.find(i => i.id === id);
}
