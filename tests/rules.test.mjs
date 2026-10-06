// Tests des règles Firestore (émulateur requis) :
//   npm test   →   firebase emulators:exec --only firestore "node --test tests/rules.test.mjs"
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, writeBatch } from "firebase/firestore";

let env;
const org = { name: "ACME", contactName: "Ali", phone: "123", email: "a@x.tn", city: "Tunis", country: "Tunisie", address: "", description: "" };
const rfq = { title: "Cartons", category: "Emballage", description: "5000 cartons", companyId: "c1", companyName: "ACME", status: "open", city: "Sfax", deadline: "2030-01-01", quantity: 5000, unit: "pièces", budget: null, currency: "TND" };
const offer = { rfqId: "r1", rfqTitle: "Cartons", companyId: "c1", companyName: "ACME", supplierId: "s1", supplierName: "Pack SA", status: "pending", price: 1000, currency: "TND", delay: "10 jours", validity: "", message: "" };
const product = { name: "Carton", category: "Emballage", description: "", price: null, currency: "TND", unit: "", minOrder: "", supplierName: "Pack SA" };

const as = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-b2b", firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 } });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/admin"), { role: "admin" });
    await setDoc(doc(db, "users/c1"), { role: "company" });
    await setDoc(doc(db, "users/c2"), { role: "company" });
    await setDoc(doc(db, "users/s1"), { role: "supplier" });
    await setDoc(doc(db, "users/s2"), { role: "supplier" });
    await setDoc(doc(db, "companies/c1"), org);
    await setDoc(doc(db, "suppliers/s1"), { ...org, name: "Pack SA", categories: ["Emballage"], status: "approved" });
    await setDoc(doc(db, "suppliers/s2"), { ...org, name: "Nouveau", categories: ["Emballage"], status: "pending" });
    await setDoc(doc(db, "rfqs/r1"), rfq);
    await setDoc(doc(db, "products/p1"), { ...product, supplierId: "s1", supplierApproved: true });
    await setDoc(doc(db, "products/p2"), { ...product, supplierId: "s2", supplierApproved: false });
  });
});

// ---- Inscription ----
test("un utilisateur ne peut pas se déclarer administrateur", async () => {
  await assertFails(setDoc(doc(as("x"), "users/x"), { role: "admin", email: "x@x" }));
  await assertSucceeds(setDoc(doc(as("x"), "users/x"), { role: "supplier", email: "x@x" }));
  await assertFails(updateDoc(doc(as("c1"), "users/c1"), { role: "admin" }));
});

test("un fournisseur s'inscrit forcément « en attente » et ne peut pas se valider", async () => {
  await setDoc(doc(as("s3"), "users/s3"), { role: "supplier", email: "s3@x" });
  await assertFails(setDoc(doc(as("s3"), "suppliers/s3"), { ...org, categories: [], status: "approved" }));
  await assertSucceeds(setDoc(doc(as("s3"), "suppliers/s3"), { ...org, categories: [], status: "pending" }));
  await assertFails(updateDoc(doc(as("s2"), "suppliers/s2"), { status: "approved" }));
  await assertSucceeds(updateDoc(doc(as("s2"), "suppliers/s2"), { description: "Fabricant" }));
  await assertSucceeds(updateDoc(doc(as("admin"), "suppliers/s2"), { status: "approved" }));
});

test("une entreprise ne peut pas créer de fiche fournisseur", async () => {
  await assertFails(setDoc(doc(as("c2"), "suppliers/c2"), { ...org, categories: [], status: "pending" }));
});

// ---- Catalogue public ----
test("le catalogue public ne montre que les fournisseurs validés", async () => {
  await assertSucceeds(getDocs(query(collection(anon(), "suppliers"), where("status", "==", "approved"))));
  await assertFails(getDocs(collection(anon(), "suppliers")));
  await assertFails(getDoc(doc(anon(), "suppliers/s2")));
  await assertSucceeds(getDoc(doc(as("s2"), "suppliers/s2")));
  await assertSucceeds(getDocs(query(collection(anon(), "products"), where("supplierApproved", "==", true))));
  await assertFails(getDoc(doc(anon(), "products/p2")));
  await assertSucceeds(getDocs(query(collection(as("s2"), "products"), where("supplierId", "==", "s2"))));
});

test("un fournisseur en attente ne peut pas rendre ses produits visibles", async () => {
  await assertFails(setDoc(doc(as("s2"), "products/p3"), { ...product, supplierId: "s2", supplierApproved: true }));
  await assertSucceeds(setDoc(doc(as("s2"), "products/p3"), { ...product, supplierId: "s2", supplierApproved: false }));
  await assertFails(updateDoc(doc(as("s2"), "products/p2"), { supplierApproved: true }));
  await assertFails(setDoc(doc(as("s1"), "products/p4"), { ...product, supplierId: "s2", supplierApproved: false }));
  await assertFails(deleteDoc(doc(as("s1"), "products/p2")));
});

// ---- Demandes de devis ----
test("seules les entreprises publient des demandes, en leur nom", async () => {
  await assertSucceeds(setDoc(doc(as("c1"), "rfqs/r2"), { ...rfq }));
  await assertFails(setDoc(doc(as("c2"), "rfqs/r3"), { ...rfq }));
  await assertFails(setDoc(doc(as("s1"), "rfqs/r4"), { ...rfq, companyId: "s1" }));
  await assertFails(updateDoc(doc(as("c2"), "rfqs/r1"), { status: "closed" }));
  await assertSucceeds(updateDoc(doc(as("c1"), "rfqs/r1"), { status: "closed" }));
});

test("les demandes sont lisibles par leur auteur et les fournisseurs validés uniquement", async () => {
  await assertSucceeds(getDocs(query(collection(as("c1"), "rfqs"), where("companyId", "==", "c1"))));
  await assertFails(getDocs(query(collection(as("c2"), "rfqs"), where("companyId", "==", "c1"))));
  await assertSucceeds(getDocs(query(collection(as("s1"), "rfqs"), where("status", "==", "open"))));
  await assertFails(getDocs(query(collection(as("s2"), "rfqs"), where("status", "==", "open"))));
  await assertFails(getDoc(doc(anon(), "rfqs/r1")));
});

// ---- Offres ----
test("un fournisseur validé envoie une seule offre, en attente", async () => {
  await assertFails(setDoc(doc(as("s1"), "offers/autre-id"), offer));
  await assertFails(setDoc(doc(as("s1"), "offers/r1_s1"), { ...offer, status: "accepted" }));
  await assertFails(setDoc(doc(as("s1"), "offers/r1_s1"), { ...offer, companyId: "c2" }));
  await assertFails(setDoc(doc(as("s2"), "offers/r1_s2"), { ...offer, supplierId: "s2" }));
  await assertSucceeds(setDoc(doc(as("s1"), "offers/r1_s1"), offer));
});

test("le fournisseur ne peut pas accepter sa propre offre ; l'entreprise oui", async () => {
  await setDoc(doc(as("s1"), "offers/r1_s1"), offer);
  await assertFails(updateDoc(doc(as("s1"), "offers/r1_s1"), { status: "accepted" }));
  await assertSucceeds(updateDoc(doc(as("s1"), "offers/r1_s1"), { price: 900 }));
  await assertFails(updateDoc(doc(as("c2"), "offers/r1_s1"), { status: "accepted" }));
  await assertFails(updateDoc(doc(as("c1"), "offers/r1_s1"), { price: 1 }));
  const c1 = as("c1");
  const b = writeBatch(c1);
  b.update(doc(c1, "offers/r1_s1"), { status: "accepted" });
  b.update(doc(c1, "rfqs/r1"), { status: "awarded" });
  await assertSucceeds(b.commit());
  await assertFails(updateDoc(doc(as("s1"), "offers/r1_s1"), { price: 800 }));
});

test("pas d'offre sur une demande clôturée", async () => {
  await updateDoc(doc(as("c1"), "rfqs/r1"), { status: "closed" });
  await assertFails(setDoc(doc(as("s1"), "offers/r1_s1"), offer));
});

test("chacun ne voit que ses offres", async () => {
  await setDoc(doc(as("s1"), "offers/r1_s1"), offer);
  await assertSucceeds(getDocs(query(collection(as("s1"), "offers"), where("supplierId", "==", "s1"))));
  await assertSucceeds(getDocs(query(collection(as("c1"), "offers"), where("companyId", "==", "c1"))));
  await assertFails(getDocs(query(collection(as("c2"), "offers"), where("companyId", "==", "c1"))));
  await assertFails(getDoc(doc(as("s2"), "offers/r1_s1")));
  await assertSucceeds(getDocs(collection(as("admin"), "offers")));
});

// ---- Administration ----
test("l'administrateur valide un fournisseur et rend ses produits visibles", async () => {
  const db = as("admin");
  const b = writeBatch(db);
  b.update(doc(db, "suppliers/s2"), { status: "approved" });
  b.update(doc(db, "products/p2"), { supplierApproved: true });
  await assertSucceeds(b.commit());
  await assertSucceeds(getDoc(doc(anon(), "products/p2")));
});

test("seul l'administrateur modifie les catégories", async () => {
  await assertSucceeds(getDoc(doc(anon(), "settings/categories")));
  await assertFails(setDoc(doc(as("c1"), "settings/categories"), { list: ["X"] }));
  await assertSucceeds(setDoc(doc(as("admin"), "settings/categories"), { list: ["X"] }));
});
