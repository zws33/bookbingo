export interface UserProfile {
  id: string;
  name: string;
  /** null, not absent: JSON reads an omitted key and an explicit null the same. */
  photoURL: string | null;
}
