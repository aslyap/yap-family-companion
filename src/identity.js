import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'yap_identity';

export async function getIdentity() {
  return AsyncStorage.getItem(KEY);
}

export async function setIdentity(identity) {
  await AsyncStorage.setItem(KEY, identity);
}

export async function clearIdentity() {
  await AsyncStorage.removeItem(KEY);
}
