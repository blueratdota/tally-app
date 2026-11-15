import { createContext, useContext } from 'react';
import { PEOPLE } from './format';
export const PeopleContext = createContext(PEOPLE);
export const usePeople = () => useContext(PeopleContext);
