import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyCQFsSzuJl5Z5F6dDH8N2Y1NBxsjIkvpcQ",
    authDomain: "sirazona1488.firebaseapp.com",
    databaseURL: "https://sirazona1488-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "sirazona1488",
    storageBucket: "sirazona1488.firebasestorage.app",
    messagingSenderId: "430644574950",
    appId: "1:430644574950:web:eb5e2b02e5b7b6c5791927"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
