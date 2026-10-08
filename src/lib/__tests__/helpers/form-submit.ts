import { act } from "@testing-library/react";

// Knöpfe eines Formulars, die es absenden – <button> ohne type zählt mit. Jedes Formular soll genau einen haben (#51).
export function submitButtons(form: HTMLFormElement): HTMLButtonElement[] {
  return Array.from(form.elements).filter(
    (el): el is HTMLButtonElement => el instanceof HTMLButtonElement && el.type === "submit"
  );
}

// jsdom kennt kein implizites Absenden: Enter in einem Feld bewirkt dort nichts. Nachgebildet wie im Browser – das
// Feld muss in einem Formular liegen, abgesendet wird über dessen ersten Submit-Knopf, ein gesperrter verhindert es.
export function pressEnter(field: HTMLElement) {
  const form = (field as HTMLInputElement).form;
  if (!form) throw new Error("Feld liegt in keinem Formular – Enter sendet nichts ab");
  const [submitter] = submitButtons(form);
  if (submitter?.disabled) return;
  act(() => form.requestSubmit(submitter));
}
