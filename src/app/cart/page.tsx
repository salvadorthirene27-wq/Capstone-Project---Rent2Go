import { Workspace } from "@/components/workspace";
import Link from "next/link";
import { pageActor } from "@/lib/page-actor";
import { readCart } from "@/modules/cart/service";
import { CartEditor } from "./cart-editor";
export const dynamic = "force-dynamic";
export const metadata = { title: "Your cart" };
export default async function Page() {
  const actor=await pageActor(),cart = await readCart(actor);
  return (
    <Workspace actor={actor}><section className="cart-page">
      <nav className="page-navigation" aria-label="Continue browsing">
        <Link href="/rentals">Car rentals</Link>
        <Link href="/tours">Tours & packages</Link>
        <Link href="/workspace">Your workspace</Link>
      </nav>
      <h1>Your cart</h1>
      <p>
        {cart.totalItems} of 20 services saved. Prices and availability are
        checked again each time you open your cart. Nothing is reserved yet.
      </p>
      <CartEditor cart={cart} />
    </section></Workspace>
  );
}
