import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import * as firestore from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

console.log('Firebase App initialized:', app.name);
console.log('Firestore DB ID from config:', firebaseConfig.firestoreDatabaseId);

// Initialize Firestore
// Using namespaced import to help registration in some environments
let firestoreDb;
try {
  const dbId = firebaseConfig.firestoreDatabaseId;
  if (dbId && dbId !== "" && dbId !== "(default)") {
    firestoreDb = firestore.getFirestore(app, dbId);
    console.log('Firestore initialized with named database:', dbId);
  } else {
    firestoreDb = firestore.getFirestore(app);
    console.log('Firestore initialized with default database');
  }
} catch (error) {
  console.error('Firestore initialization error:', error);
  // Fallback
  firestoreDb = firestore.getFirestore(app);
}

export const db = firestoreDb;
export const auth = getAuth(app);

export { firestore }; // Export firestore namespace for utility usage if needed

// Validation check
export async function testConnection() {
  try {
    await firestore.getDocFromServer(firestore.doc(db, 'test', 'connection'));
    console.log("Firebase connection established successfully");
  } catch (error: any) {
    if (error.code === 'permission-denied') return;
    console.error("Firebase connection test error:", error.message || error);
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
