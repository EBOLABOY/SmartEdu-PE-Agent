import AuthPanel from "@/components/auth/AuthPanel";
import AuthPageShell from "@/components/auth/AuthPageShell";

export default function RegisterPage() {
  return (
    <AuthPageShell
      description="创建账号后请完善教师姓名、学校名称和任教年级，后续教案会自动带入这些信息。"
      title="注册并完善教师资料"
    >
      <AuthPanel initialMode="sign-up" />
    </AuthPageShell>
  );
}
