export type Passage = {
  id: string;
  book: number;
  section: number;
  roman: string;
  text: string;
};

export type Corpus = {
  source: string;
  translator: string;
  language: string;
  passages: Passage[];
};
