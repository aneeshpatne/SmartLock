import QRCodeReader from "./components/QRCodeReader";

export default function Home() {
  return (
    <div className="min-h-screen p-8">
      <main className="flex flex-col items-center gap-8">
        <QRCodeReader />
      </main>
    </div>
  );
}
