export interface ArtworkMetadata {
  title?: string;
  medium?: string;
  year?: string;
  dimensions?: string;
  availability?: string;
  description?: string;
}

export const artworkMetadata: Record<string, ArtworkMetadata> = {
  '1': {
    title: 'Untitled I',
    medium: 'Fine art',
    year: 'Recent work',
    dimensions: 'Dimensions available on request',
    availability: 'Available on request',
  },
  '2': {
    title: 'Untitled II',
    medium: 'Fine art',
    year: 'Recent work',
    dimensions: 'Dimensions available on request',
    availability: 'Available on request',
  },
  '3': {
    title: 'Untitled III',
    medium: 'Fine art',
    year: 'Recent work',
    dimensions: 'Dimensions available on request',
    availability: 'Available on request',
  },
};
