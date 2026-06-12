import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getIdentity,
  setIdentity as persistIdentity,
  clearIdentity as persistClear,
} from '../identity';

const IdentityContext = createContext(null);

export function IdentityProvider({ children }) {
  const [identity, setIdentity] = useState(undefined); // undefined = loading

  useEffect(() => {
    getIdentity().then(setIdentity);
  }, []);

  const chooseIdentity = async (id) => {
    await persistIdentity(id);
    setIdentity(id);
  };

  const clearIdentity = async () => {
    await persistClear();
    setIdentity(null);
  };

  return (
    <IdentityContext.Provider value={{ identity, chooseIdentity, clearIdentity }}>
      {children}
    </IdentityContext.Provider>
  );
}

export const useIdentity = () => useContext(IdentityContext);
