"use client";

import Navigation from "@/components/landing/Navigation";
import HeroSection from "@/components/landing/HeroSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import ModelsSection from "@/components/landing/ModelsSection";
import GetStartedSection from "@/components/landing/GetStartedSection";
import Footer from "@/components/landing/Footer";

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-[#111118] text-white font-sans overflow-x-hidden antialiased selection:bg-brand-500 selection:text-white">
      {/* Background grid */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(to right, #5B52F5 1px, transparent 1px), linear-gradient(to bottom, #5B52F5 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }} />
      </div>

      <div className="relative z-10">
        <Navigation />
        <main>
          <HeroSection />
          <FeaturesSection />
          <HowItWorksSection />
          <ModelsSection />
          <GetStartedSection />
        </main>
        <Footer />
      </div>
    </div>
  );
}
