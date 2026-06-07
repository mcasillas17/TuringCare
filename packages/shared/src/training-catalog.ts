export type CatalogLevel = {
  level: 1 | 2 | 3 | 4 | 5;
  description: string;
};

export type CatalogSkill = {
  key: string;
  name: string;
  description: string;
  levels: CatalogLevel[];
};

export type CatalogTemplate = {
  key: string;
  name: string;
  description: string;
  skills: CatalogSkill[];
};
