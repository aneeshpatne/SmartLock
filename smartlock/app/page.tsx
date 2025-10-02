import QRCodeReader from "./components/QRCodeReader";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[5%] top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,_rgba(14,165,233,0.35),_transparent_70%)] blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-4rem] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,_rgba(236,72,153,0.3),_transparent_65%)] blur-3xl" />
        <div className="absolute inset-x-0 top-1/2 h-64 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,_rgba(59,130,246,0.18),_transparent_60%)] blur-2xl" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-4 py-16 md:px-8 md:py-24">
        <QRCodeReader />
      </main>
    </div>
  );
}
