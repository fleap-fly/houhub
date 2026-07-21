"use client"

import { useCallback, useMemo, useState } from "react"
import {
  Building2,
  Check,
  ChevronUp,
  CircleUserRound,
  Loader2,
  LogIn,
  LogOut,
} from "lucide-react"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import { useShallow } from "zustand/react/shallow"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useHouflowDesktopStore } from "@/houflow"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import { cn } from "@/lib/utils"
import { useWorkbenchStore } from "@/workbench"

interface AccountMenuCopy {
  accounts: string
  checking: string
  houflow: string
  project: string
  signIn: string
  signedIn: string
  signOutHouflow: string
  signOutProject: string
  loginFailed: string
  logoutFailed: string
}

const COPY: Record<string, AccountMenuCopy> = {
  "zh-CN": {
    accounts: "账户",
    checking: "正在检查账户",
    houflow: "Houflow",
    project: "项目账户",
    signIn: "登录",
    signedIn: "已登录",
    signOutHouflow: "退出 Houflow",
    signOutProject: "退出项目账户",
    loginFailed: "登录失败",
    logoutFailed: "退出登录失败",
  },
  "zh-TW": {
    accounts: "帳戶",
    checking: "正在檢查帳戶",
    houflow: "Houflow",
    project: "專案帳戶",
    signIn: "登入",
    signedIn: "已登入",
    signOutHouflow: "登出 Houflow",
    signOutProject: "登出專案帳戶",
    loginFailed: "登入失敗",
    logoutFailed: "登出失敗",
  },
  en: {
    accounts: "Accounts",
    checking: "Checking accounts",
    houflow: "Houflow",
    project: "Project account",
    signIn: "Sign in",
    signedIn: "Signed in",
    signOutHouflow: "Sign out of Houflow",
    signOutProject: "Sign out of project account",
    loginFailed: "Sign-in failed",
    logoutFailed: "Sign-out failed",
  },
  ja: {
    accounts: "アカウント",
    checking: "アカウントを確認中",
    houflow: "Houflow",
    project: "プロジェクトアカウント",
    signIn: "サインイン",
    signedIn: "サインイン済み",
    signOutHouflow: "Houflow からサインアウト",
    signOutProject: "プロジェクトからサインアウト",
    loginFailed: "サインインに失敗しました",
    logoutFailed: "サインアウトに失敗しました",
  },
  ko: {
    accounts: "계정",
    checking: "계정 확인 중",
    houflow: "Houflow",
    project: "프로젝트 계정",
    signIn: "로그인",
    signedIn: "로그인됨",
    signOutHouflow: "Houflow 로그아웃",
    signOutProject: "프로젝트 계정 로그아웃",
    loginFailed: "로그인 실패",
    logoutFailed: "로그아웃 실패",
  },
  es: {
    accounts: "Cuentas",
    checking: "Comprobando cuentas",
    houflow: "Houflow",
    project: "Cuenta del proyecto",
    signIn: "Iniciar sesión",
    signedIn: "Sesión iniciada",
    signOutHouflow: "Cerrar sesión en Houflow",
    signOutProject: "Cerrar sesión del proyecto",
    loginFailed: "Error al iniciar sesión",
    logoutFailed: "Error al cerrar sesión",
  },
  de: {
    accounts: "Konten",
    checking: "Konten werden geprüft",
    houflow: "Houflow",
    project: "Projektkonto",
    signIn: "Anmelden",
    signedIn: "Angemeldet",
    signOutHouflow: "Von Houflow abmelden",
    signOutProject: "Vom Projektkonto abmelden",
    loginFailed: "Anmeldung fehlgeschlagen",
    logoutFailed: "Abmeldung fehlgeschlagen",
  },
  fr: {
    accounts: "Comptes",
    checking: "Vérification des comptes",
    houflow: "Houflow",
    project: "Compte projet",
    signIn: "Se connecter",
    signedIn: "Connecté",
    signOutHouflow: "Se déconnecter de Houflow",
    signOutProject: "Se déconnecter du projet",
    loginFailed: "Échec de la connexion",
    logoutFailed: "Échec de la déconnexion",
  },
  pt: {
    accounts: "Contas",
    checking: "Verificando contas",
    houflow: "Houflow",
    project: "Conta do projeto",
    signIn: "Entrar",
    signedIn: "Conectado",
    signOutHouflow: "Sair do Houflow",
    signOutProject: "Sair da conta do projeto",
    loginFailed: "Falha ao entrar",
    logoutFailed: "Falha ao sair",
  },
  ar: {
    accounts: "الحسابات",
    checking: "جارٍ التحقق من الحسابات",
    houflow: "Houflow",
    project: "حساب المشروع",
    signIn: "تسجيل الدخول",
    signedIn: "تم تسجيل الدخول",
    signOutHouflow: "تسجيل الخروج من Houflow",
    signOutProject: "تسجيل الخروج من حساب المشروع",
    loginFailed: "فشل تسجيل الدخول",
    logoutFailed: "فشل تسجيل الخروج",
  },
}

function resolveCopy(locale: string): AccountMenuCopy {
  const normalized = locale.toLowerCase()
  if (normalized.startsWith("zh")) {
    return normalized.includes("tw") || normalized.includes("hant")
      ? COPY["zh-TW"]
      : COPY["zh-CN"]
  }
  return COPY[normalized.split("-")[0]] ?? COPY.en
}

export function HouhubAccountMenu() {
  const locale = useLocale()
  const copy = useMemo(() => resolveCopy(locale), [locale])
  const houflow = useHouflowDesktopStore(
    useShallow((state) => ({
      status: state.status,
      session: state.session,
      error: state.error,
      signIn: state.signInWithHouflow,
      signOut: state.signOut,
    }))
  )
  const workbench = useWorkbenchStore(
    useShallow((state) => ({
      status: state.status,
      session: state.session,
      error: state.error,
      signIn: state.signIn,
      signOut: state.signOut,
    }))
  )
  const [pending, setPending] = useState<"houflow" | "project" | null>(null)

  const houflowConnected = houflow.session.status === "signed_in"
  const projectConnected = workbench.session.status === "signed_in"
  const checking =
    houflow.status === "loading" || workbench.status === "loading"
  const busy =
    pending != null ||
    houflow.status === "signing_in" ||
    workbench.status === "signing_in"
  const activeProject = workbench.session.projects.find(
    (project) => project.projectId === workbench.session.activeProjectId
  )
  const displayLabel =
    houflow.session.userLabel || workbench.session.user?.label || copy.accounts

  const signInHouflow = useCallback(async () => {
    setPending("houflow")
    try {
      await houflow.signIn({ openAuthorizationUrl: openUrl })
    } catch (error) {
      toast.error(copy.loginFailed, { description: toErrorMessage(error) })
    } finally {
      setPending(null)
    }
  }, [copy.loginFailed, houflow])

  const signInProject = useCallback(async () => {
    setPending("project")
    try {
      await workbench.signIn({ openAuthorizationUrl: openUrl })
    } catch (error) {
      toast.error(copy.loginFailed, { description: toErrorMessage(error) })
    } finally {
      setPending(null)
    }
  }, [copy.loginFailed, workbench])

  const signOut = useCallback(
    async (provider: "houflow" | "project") => {
      setPending(provider)
      try {
        if (provider === "houflow") await houflow.signOut()
        else await workbench.signOut()
      } catch (error) {
        toast.error(copy.logoutFailed, { description: toErrorMessage(error) })
      } finally {
        setPending(null)
      }
    },
    [copy.logoutFailed, houflow, workbench]
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          title={checking ? copy.checking : copy.accounts}
          aria-label={copy.accounts}
        >
          <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/10 text-sidebar-primary">
            <CircleUserRound className="h-4 w-4" />
            <span
              className={cn(
                "absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full border-2 border-sidebar",
                houflowConnected
                  ? "bg-emerald-500"
                  : houflow.error
                    ? "bg-destructive"
                    : "bg-muted-foreground/45"
              )}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
            {checking ? copy.checking : displayLabel}
          </span>
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <span className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  projectConnected
                    ? "bg-sky-500"
                    : workbench.error
                      ? "bg-destructive"
                      : "bg-muted-foreground/45"
                )}
              />
              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-72">
        <DropdownMenuLabel>{copy.accounts}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-11"
          disabled={busy}
          onSelect={() => {
            if (!houflowConnected) void signInHouflow()
          }}
        >
          <CircleUserRound className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{copy.houflow}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {houflowConnected
                ? houflow.session.userLabel || copy.signedIn
                : copy.signIn}
            </span>
          </span>
          {pending === "houflow" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : houflowConnected ? (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-11"
          disabled={busy}
          onSelect={() => {
            if (!projectConnected) void signInProject()
          }}
        >
          <Building2 className="h-4 w-4" />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{copy.project}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {projectConnected
                ? activeProject?.name ||
                  workbench.session.user?.label ||
                  copy.signedIn
                : copy.signIn}
            </span>
          </span>
          {pending === "project" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : projectConnected ? (
            <Check className="h-3.5 w-3.5 text-sky-600" />
          ) : (
            <LogIn className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
        {houflowConnected || projectConnected ? (
          <>
            <DropdownMenuSeparator />
            {houflowConnected ? (
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => void signOut("houflow")}
              >
                <LogOut className="h-4 w-4" />
                {copy.signOutHouflow}
              </DropdownMenuItem>
            ) : null}
            {projectConnected ? (
              <DropdownMenuItem
                disabled={busy}
                onSelect={() => void signOut("project")}
              >
                <LogOut className="h-4 w-4" />
                {copy.signOutProject}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
