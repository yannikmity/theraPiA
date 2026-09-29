import { getConfig } from "../config";
import { createFeedbackStore, type FeedbackStore } from "./store";

let store: FeedbackStore | undefined;

// Ein Store pro Prozess, Verzeichnis aus der geprüften Konfiguration (FEEDBACK_DIR).
export function getFeedbackStore(): FeedbackStore {
  store ??= createFeedbackStore(getConfig().FEEDBACK_DIR);
  return store;
}
