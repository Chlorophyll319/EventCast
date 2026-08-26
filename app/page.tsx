import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold">EventCast</h1>
      <div className="flex flex-col items-center gap-2">
        <Link
          href="/login"
          className="rounded bg-black px-4 py-2 text-white"
        >
          登入 / 註冊
        </Link>
        <p className="text-sm text-gray-500">
          使用 Magic Link，一鍵登入或建立帳號
        </p>
      </div>
    </main>
  );
}
