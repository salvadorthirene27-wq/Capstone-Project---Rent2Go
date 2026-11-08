import Link from "next/link";
import Image from "next/image";
import { HomeMotion } from "@/components/home-motion";
import { ArrowUpRight, ArrowRight, Check, CarFront, Map, FileCheck2 } from "lucide-react";
import "./landing.css";
export default function Home() {
  return (
    <main className="marc-home min-h-screen bg-[#FAFAFA] font-sans scroll-smooth">
      <HomeMotion />
      {/* --- HERO SECTION --- */}
      <div className="home-hero relative w-[96%] mx-auto mt-4 rounded-[40px] h-[800px] overflow-hidden bg-black shadow-2xl">
        <Image
          src="/landing/hero.jpg"
          sizes="96vw"
          alt=""
          fill
          priority
          className="home-hero-image object-cover object-bottom opacity-50 z-0"
        />

        <div className="relative z-10 flex flex-col h-full">
          {/* Hero Content - More humble & mission-focused */}
          <div id="main-content" tabIndex={-1} className="home-hero-content flex-grow flex flex-col items-center justify-center gap-5 px-4 text-center">
            <p className="home-eyebrow">Car rentals. Tour packages. Local agencies.</p>
            <h1 className="home-hero-title text-5xl md:text-6xl font-bold text-white max-w-4xl leading-[1.2] tracking-tight drop-shadow-xl">
              Bridging the Gap in <br />
              <span className="text-[#ABD1C6]">Philippine Car Rentals.</span>
            </h1>

            <p className="text-white/70 text-base md:text-lg max-w-2xl font-light tracking-wide leading-relaxed">
              A connected marketplace where{" "}
              <strong>renters</strong> find rides,
              <strong> agencies</strong> grow their reach, and{" "}
              <strong>cosigners</strong> share their vehicles through partner agencies.
            </p>

            <div className="home-hero-actions mt-4 flex flex-wrap justify-center gap-4">
              <Link href="/rentals" className="px-9 py-3.5 bg-[#ABD1C6] hover:bg-[#c4e3db] text-[#2F5D50] transition-all rounded-full font-bold text-base shadow-xl">Find a Ride</Link>
              <Link href="/partners" className="px-9 py-3.5 border border-white/30 text-white hover:bg-white/10 transition-all rounded-full font-bold text-base">Learn About Partnering</Link>
            </div>
            <Link href="/tours" className="home-tour-link">Looking for an experience? Explore tours <ArrowRight size={17} aria-hidden="true" /></Link>
            <ul className="home-assurances" aria-label="How booking works">
              <li><Check size={16} aria-hidden="true" /> Approved agency listings</li>
              <li><Check size={16} aria-hidden="true" /> Terms before payment</li>
              <li><Check size={16} aria-hidden="true" /> Booking updates in your workspace</li>
            </ul>
          </div>
        </div>
      </div>

      <section className="home-journey" aria-label="Your booking journey">
        <div><CarFront size={23} aria-hidden="true" /><p><strong>Choose your ride</strong><span>Compare vehicles, agencies and service terms.</span></p></div>
        <div><Map size={23} aria-hidden="true" /><p><strong>Find your experience</strong><span>Explore group tours and private packages.</span></p></div>
        <div><FileCheck2 size={23} aria-hidden="true" /><p><strong>Review, then book</strong><span>Accept your quotation and agreement before payment.</span></p></div>
      </section>

      {/* --- CAR LOGOS SECTION --- */}
      <div className="w-full py-16 bg-white overflow-hidden">
        {" "}
        {/* Changed bg to white */}
        <div className="max-w-6xl mx-auto px-6">
          <p className="home-brands-label text-center text-[10px] uppercase tracking-[0.3em] font-bold text-gray-400 mb-10">
            Vehicle brands
          </p>

          <div className="home-brand-strip flex flex-wrap justify-center items-center gap-12 md:gap-20 opacity-30 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-700 ease-in-out">
            {/* Logo 1 */}
            <div className="relative w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/landing/logo1.png"
                alt="Toyota"
                fill
                className="object-contain"
              />
            </div>
            {/* Logo 2 */}
            <div className="relative w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/landing/logo2.png"
                alt="Mitsubishi"
                fill
                className="object-contain"
              />
            </div>
            {/* Logo 3 (Note: your file was .jpg) */}
            <div className="relative w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/landing/logo3.jpg"
                alt="Nissan"
                fill
                className="object-contain"
              />
            </div>
            {/* Logo 4 */}
            <div className="relative w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/landing/logo4.png"
                alt="Ford"
                fill
                className="object-contain"
              />
            </div>
            {/* Logo 5 */}
            <div className="relative w-12 h-12 md:w-16 md:h-16">
              <Image
                src="/landing/logo5.png"
                alt="Suzuki"
                fill
                className="object-contain"
              />
            </div>
          </div>
        </div>
      </div>

      {/* --- ROLES / HOW IT WORKS SECTION --- */}
      <section id="roles" className="py-24 px-6 bg-white scroll-mt-10">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
            Three parts of a better journey.
          </h2>

          <p className="text-gray-500 mt-4 max-w-xl mx-auto text-sm md:text-base leading-relaxed">
            A simple space where tourists, agencies, and cosigners connect.
            Helping the Philippine rental community move forward, together.
          </p>

          <div className="home-role-grid grid grid-cols-1 md:grid-cols-3 gap-8 mt-16" data-home-reveal="">
            {/* Role: Customer */}
            <div className="home-role p-10 bg-[#F9F9F9] rounded-[32px] border border-gray-100 text-left hover:border-[#ABD1C6] transition-all">
              <div className="w-14 h-14 rounded-2xl bg-[#2F5D50] text-[#ABD1C6] flex items-center justify-center font-black text-xl mb-6 shadow-lg">
                01
              </div>
              <h3 className="text-2xl font-bold mb-3 text-gray-900">
                Customers
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Browse approved agency vehicles and tour packages. Compare service terms, submit requirements, and follow your booking in one place.
              </p>
              <ul className="text-xs font-bold text-[#2F5D50] space-y-2 uppercase tracking-wider">
                <li>• Easy Booking</li>
                <li>• Verified Fleet</li>
                <li>• Booking Updates</li>
              </ul>
              <Link className="home-role-link" href="/rentals">Browse rentals <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </div>

            {/* Role: Agency */}
            <div className="home-role home-role-agency p-10 bg-white rounded-[32px] border-2 border-[#2F5D50] text-left shadow-2xl scale-105 relative z-10">
              <div className="w-14 h-14 rounded-2xl bg-[#ABD1C6] text-[#2F5D50] flex items-center justify-center font-black text-xl mb-6 shadow-lg">
                02
              </div>
              <h3 className="text-2xl font-bold mb-3 text-gray-900">
                Rental Agencies
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Scale your business by listing your fleet on our marketplace.
                Manage bookings, vehicle availability, and your agency’s service policies.
              </p>
              <ul className="text-xs font-bold text-[#2F5D50] space-y-2 uppercase tracking-wider">
                <li>• Fleet Management</li>
                <li>• Increased Visibility</li>
                <li>• Clear Revenue Sharing</li>
              </ul>
              <Link className="home-role-link" href="/partners">Partner your agency <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </div>

            {/* Role: Cosigner */}
            <div className="home-role p-10 bg-[#F9F9F9] rounded-[32px] border border-gray-100 text-left hover:border-[#ABD1C6] transition-all">
              <div className="w-14 h-14 rounded-2xl bg-[#2F5D50] text-[#ABD1C6] flex items-center justify-center font-black text-xl mb-6 shadow-lg">
                03
              </div>
              <h3 className="text-2xl font-bold mb-3 text-gray-900">
                Cosigners
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Offer your personal vehicle through an approved agency. Review consignment terms, manage availability, and follow your vehicle’s bookings and earnings.
              </p>
              <ul className="text-xs font-bold text-[#2F5D50] space-y-2 uppercase tracking-wider">
                <li>• Earn Commissions</li>
                <li>• Agency Agreements</li>
                <li>• Vehicle Ownership</li>
              </ul>
              <Link className="home-role-link" href="/workspace/vehicles/new">Offer your vehicle <ArrowUpRight size={17} aria-hidden="true" /></Link>
            </div>
          </div>
        </div>
      </section>

      {/* --- VEHICLE CATEGORIES --- */}
      <section className="home-fleet py-24 px-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-baseline mb-12 gap-4 border-b border-gray-100 pb-8">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tighter italic uppercase">
              Explore the Fleet
            </h2>
            <p className="text-gray-500 mt-1 text-sm font-medium">
              Browse by vehicle type. Availability depends on your dates.
            </p>
          </div>
          <Link
            href="/rentals"
            className="group/link flex items-center gap-3 text-[#2F5D50] font-black text-[10px] tracking-[0.2em] uppercase"
          >
            VIEW ALL{" "}
            <span className="text-lg group-hover/link:translate-x-1 transition-transform">
              →
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          {[
            {
              name: "Sedans",
              desc: "City & Economy",
              src: "/landing/sedan.png",
            },
            {
              name: "SUVs",
              desc: "Rough Road Utility",
              src: "/landing/suv.png",
            },
            { name: "Vans", desc: "Group Transport", src: "/landing/van.jpg" },
          ].map((cat) => (
            <Link key={cat.name} href={`/rentals?bodyType=${cat.name === "Sedans" ? "SEDAN" : cat.name === "SUVs" ? "SUV" : "VAN"}`} className="home-fleet-card group cursor-pointer" data-home-reveal="">
              <div className="mb-4 px-1">
                <h3 className="font-bold text-gray-900 text-xl group-hover:text-[#2F5D50] transition-colors tracking-tight">
                  {cat.name}
                </h3>
                <p className="text-[10px] text-gray-500 font-semibold tracking-[0.2em] uppercase mt-1">
                  {cat.desc}
                </p>
              </div>
              <div className="relative w-full h-56 bg-gray-100 rounded-[32px] overflow-hidden border border-gray-50 group-hover:border-[#ABD1C6] transition-all duration-500">
                <div className="home-fleet-image relative w-full h-full z-10 group-hover:scale-110 transition-transform duration-700 ease-in-out">
                  <Image
                    src={cat.src}
                    alt={cat.name}
                    fill
                    sizes="30vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* --- MODIFIED FINAL CTA SECTION --- */}
      <section id="booking-guide" className="px-6 pb-24">
        <div className="home-final-cta max-w-6xl mx-auto bg-[#2F5D50] rounded-[48px] px-10 py-20 text-center relative overflow-hidden shadow-2xl" data-home-reveal="">
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-[#ABD1C6]/10 rounded-full blur-3xl" />

          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter italic uppercase mb-6">
              Find Your Place in the{" "}
              <span className="text-[#ABD1C6]">Ecosystem.</span>
            </h2>
            <p className="text-white/60 mt-4 max-w-2xl mx-auto text-lg">
              Browse rentals or tours, choose your dates, and submit your cart.
              Each agency reviews its request before quotation, agreement, and payment.
            </p>

            <div className="mt-12 flex flex-col md:flex-row justify-center gap-6">
              <Link href="/rentals" className="px-10 py-5 bg-[#ABD1C6] text-[#2F5D50] font-black rounded-full hover:scale-105 transition-all shadow-xl uppercase tracking-widest text-xs">I want to Rent</Link>
              <Link href="/partners" className="px-10 py-5 border-2 border-white/20 text-white font-black rounded-full hover:bg-white hover:text-[#2F5D50] transition-all uppercase tracking-widest text-xs">I am an Agency</Link>
              <Link href="/workspace/vehicles/new" className="px-10 py-5 bg-white/5 border border-white/10 text-white font-black rounded-full hover:bg-white/20 transition-all uppercase tracking-widest text-xs">Become a Cosigner</Link>
            </div>
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="bg-white border-t border-gray-100 pt-24 pb-10 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
          <div className="col-span-1">
            <div className="text-2xl font-bold tracking-tighter text-[#2F5D50] mb-6">
              Rent2Go
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Connecting Customers, Agencies, and Cosigners across the
              Philippines.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-gray-900">
              For Customers
            </h4>
            <ul className="space-y-4 text-sm text-gray-500">
              <li>
                <Link href="/rentals" className="hover:text-[#2F5D50]">
                  Browse Fleet
                </Link>
              </li>
              <li>
                <Link href="/tours" className="hover:text-[#2F5D50]">
                  Curated Tours
                </Link>
              </li>
              <li>
                <Link href="/#booking-guide" className="hover:text-[#2F5D50]">
                  Booking Guide
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-gray-900">
              For Partners
            </h4>
            <ul className="space-y-4 text-sm text-gray-500">
              <li>
                <Link href="/partners" className="hover:text-[#2F5D50]">
                  Agency Portal
                </Link>
              </li>
              <li>
                <Link href="/workspace/vehicles/new" className="hover:text-[#2F5D50]">
                  Cosigner Program
                </Link>
              </li>
              <li>
                <Link href="/partners" className="hover:text-[#2F5D50]">
                  Partner Benefits
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-6 text-sm uppercase tracking-widest text-gray-900">
              Support
            </h4>
            <ul className="space-y-4 text-sm text-gray-500">
              <li><Link href="/#booking-guide">Booking Guide</Link></li>
              <li><Link href="/agencies">Agency Terms</Link></li>
              <li><Link href="/workspace/bookings">My Bookings</Link></li>
            </ul>
          </div>
        </div>
        <div className="home-footer-meta max-w-7xl mx-auto pt-8 border-t border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase font-bold text-gray-400 tracking-widest">
          <p>© 2026 Rent2Go Philippines.</p>
          <div className="flex gap-6">
            <Link href="/help">Help</Link>
            <Link href="/terms">Marketplace terms</Link>
            <span>Cars, tours and agency partners</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
