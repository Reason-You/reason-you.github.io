export interface DarkSkyDestination {
  id: string;
  englishName: string;
  chineseName: string;
  country: string;
  chineseDescription: string;
  latitude: number;
  longitude: number;
}

/** Model estimates supplied from coordinate lookups in the 2025 atlas. */
export const DARK_SKY_ATLAS = {
  name: '2025 Light Pollution Atlas',
  year: 2025,
  sqmMinimum: 21.99,
  bortleApprox: 1,
} as const;

export const DARK_SKY_DESTINATIONS: readonly DarkSkyDestination[] = [
  { id: 'steens', englishName: 'Steens Mountain Area', chineseName: '斯廷斯山地区', country: 'United States',
    chineseDescription: '美国俄勒冈州东南部的高海拔山地荒野。', latitude: 42.59753, longitude: -118.64663 },
  { id: 'frank-church', englishName: 'Frank Church Wilderness', chineseName: '弗兰克丘奇荒野', country: 'United States',
    chineseDescription: '美国爱达荷州中部的偏远山地荒野。', latitude: 45, longitude: -114.8 },
  { id: 'ennedi', englishName: 'Ennedi Plateau', chineseName: '恩内迪高原', country: 'Chad',
    chineseDescription: '乍得东北部、撒哈拉沙漠中的砂岩高原。', latitude: 18.3, longitude: 22 },
  { id: 'rub-al-khali', englishName: "Rub' al Khali", chineseName: '鲁卜哈利沙漠', country: 'Saudi Arabia',
    chineseDescription: '阿拉伯半岛南部的广袤沙漠。', latitude: 19.5, longitude: 49.5 },
  { id: 'changtang', englishName: 'Changtang Plateau', chineseName: '羌塘高原', country: 'China',
    chineseDescription: '青藏高原北部的高海拔荒原。', latitude: 33, longitude: 84.1 },
  { id: 'gobi', englishName: 'Gobi Desert', chineseName: '蒙古戈壁', country: 'Mongolia',
    chineseDescription: '蒙古国南部的戈壁荒漠。', latitude: 43, longitude: 103 },
  { id: 'namibrand', englishName: 'NamibRand Nature Reserve', chineseName: '纳米布兰德自然保护区', country: 'Namibia',
    chineseDescription: '纳米比亚西南部、纳米布沙漠中的自然保护区。', latitude: -25.22847, longitude: 16.06038 },
  { id: 'kalahari', englishName: 'Central Kalahari', chineseName: '中央卡拉哈里', country: 'Botswana',
    chineseDescription: '博茨瓦纳中部的卡拉哈里荒漠。', latitude: -22.5, longitude: 23 },
  { id: 'great-victoria', englishName: 'Great Victoria Desert', chineseName: '大维多利亚沙漠', country: 'Australia',
    chineseDescription: '澳大利亚西部的内陆沙漠。', latitude: -29.3, longitude: 124 },
  { id: 'lake-eyre', englishName: 'Kati Thanda–Lake Eyre', chineseName: '卡蒂坦达艾尔湖', country: 'Australia',
    chineseDescription: '澳大利亚南部的内陆盐湖地区。', latitude: -28.42, longitude: 137.27 },
  { id: 'salar-de-tara', englishName: 'Salar de Tara Area', chineseName: '塔拉盐沼附近', country: 'Chile',
    chineseDescription: '智利北部、安第斯高原上的塔拉盐沼周边地区。', latitude: -23, longitude: -67.3 },
  { id: 'salar-de-uyuni', englishName: 'Salar de Uyuni', chineseName: '乌尤尼盐沼', country: 'Bolivia',
    chineseDescription: '玻利维亚西南部的高原盐沼。', latitude: -20.23, longitude: -67.53 },
  { id: 'pitcairn', englishName: 'Pitcairn Island', chineseName: '皮特凯恩岛', country: 'Pitcairn Islands · UK',
    chineseDescription: '南太平洋中的岛屿，属英国海外领地皮特凯恩群岛。', latitude: -25.0667, longitude: -130.102 },
  { id: 'chatham', englishName: 'Chatham Islands', chineseName: '查塔姆群岛', country: 'New Zealand',
    chineseDescription: '新西兰以东的南太平洋群岛。', latitude: -43.82, longitude: -176.55 },
  { id: 'patagonia', englishName: 'Patagonian Steppe', chineseName: '巴塔哥尼亚高原', country: 'Argentina',
    chineseDescription: '阿根廷南部、安第斯山脉以东的干燥高原。', latitude: -47.2, longitude: -69.4 },
];
