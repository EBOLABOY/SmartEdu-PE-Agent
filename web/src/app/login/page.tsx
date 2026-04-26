import AuthPanel from "@/components/auth/AuthPanel";
import AuthPageShell from "@/components/auth/AuthPageShell";

export default function LoginPage() {
  return (
    <AuthPageShell
      description="登录后启用 Supabase 项目保存、历史恢复、版本追踪和教师资料自动填充。"
      title="登录创AI账号"
    >
      <AuthPanel initialMode="sign-in" />
    </AuthPageShell>
  );
}
