import { VerifyConfirmButton } from "./VerifyConfirmButton";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <p>登入連結無效。</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p>點擊下方按鈕完成登入。</p>
      <VerifyConfirmButton token={token} />
    </main>
  );
}
