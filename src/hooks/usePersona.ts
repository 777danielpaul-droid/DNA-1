import { useEffect, useState } from 'react';
import { getPersona, Persona, PERSONA_CHANGE_EVENT } from '../lib/persona';

/** Liefert die aktuelle Persona (Name + Seele) und aktualisiert sich automatisch,
 *  sobald sie irgendwo (z. B. im "INJECT SOUL"-Dialog) geändert wird. */
export function usePersona(): Persona {
  const [persona, setPersonaState] = useState<Persona>(() => getPersona());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Persona>).detail;
      setPersonaState(detail ?? getPersona());
    };
    window.addEventListener(PERSONA_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(PERSONA_CHANGE_EVENT, onChange);
  }, []);

  return persona;
}
