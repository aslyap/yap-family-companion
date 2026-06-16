export const COLORS = {
  maddie: '#B898A0',
  maddieLight: '#F5ECEE',
  alex: '#7AA8A0',
  alexLight: '#E8F2F0',
  marj: '#D4A86A',
  marjLight: '#F5F0E0',
  kath: '#C87C6B',
  kathLight: '#F2E8E4',
  adrian: '#5A80A0',
  adrianLight: '#E8EEF4',
  family: '#B5A895',
  familyLight: '#F0EDE8',
  background: '#FFFFFF',
  surface: '#F8F8F8',
  text: '#2A2A2A',
  textSecondary: '#8A8A8A',
  border: '#E8E8E8',
  timeIndicator: '#E8A838',
};

export const FONTS = {
  heading: 'Figtree_600SemiBold',
  headingBold: 'Figtree_700Bold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
};

export const getAccentColor = (identity) =>
  identity === 'kath' ? COLORS.kath : COLORS.adrian;

export const getAccentLight = (identity) =>
  identity === 'kath' ? COLORS.kathLight : COLORS.adrianLight;

export const getPersonLabel = (identity) =>
  identity === 'kath' ? 'Kath' : 'Adrian';

export const PERSON_COLORS = {
  maddie: COLORS.maddie,
  alex: COLORS.alex,
  marj: COLORS.marj,
  family: COLORS.family,
};

export const PERSON_LIGHT = {
  maddie: COLORS.maddieLight,
  alex: COLORS.alexLight,
  marj: COLORS.marjLight,
  family: COLORS.familyLight,
};
