"use client"

import { useCallback, useMemo, useState } from "react"
import { Building2, Check, Loader2, LogOut, RefreshCw } from "lucide-react"
import { useLocale } from "next-intl"
import { toast } from "sonner"

import { useWorkbenchStore } from "@/workbench"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toErrorMessage } from "@/lib/app-error"
import { openUrl } from "@/lib/platform"
import { cn } from "@/lib/utils"

interface WorkbenchAccountCopy {
  signIn: string
  signingIn: string
  checking: string
  signedIn: string
  signedInDescription: string
  project: string
  switchProject: string
  noProjects: string
  refresh: string
  signOut: string
  signInFailed: string
  unknownUser: string
}

const COPY: Record<string, WorkbenchAccountCopy> = {
  "zh-CN": {
    signIn: "工作台登录",
    signingIn: "正在登录工作台",
    checking: "正在检查工作台",
    signedIn: "企业工作台",
    signedInDescription: "已连接企业数字资产空间",
    project: "当前项目",
    switchProject: "切换项目",
    noProjects: "暂无可访问的项目",
    refresh: "刷新",
    signOut: "退出工作台",
    signInFailed: "工作台登录失败",
    unknownUser: "工作台账号",
  },
  "zh-TW": {
    signIn: "工作台登入",
    signingIn: "正在登入工作台",
    checking: "正在檢查工作台",
    signedIn: "企業工作台",
    signedInDescription: "已連線企業數位資產空間",
    project: "目前專案",
    switchProject: "切換專案",
    noProjects: "暫無可存取的專案",
    refresh: "重新整理",
    signOut: "登出工作台",
    signInFailed: "工作台登入失敗",
    unknownUser: "工作台帳號",
  },
  en: {
    signIn: "Sign in to workbench",
    signingIn: "Signing in to workbench",
    checking: "Checking workbench",
    signedIn: "Enterprise workbench",
    signedInDescription: "Connected to the enterprise asset space",
    project: "Current project",
    switchProject: "Switch project",
    noProjects: "No accessible projects",
    refresh: "Refresh",
    signOut: "Sign out of workbench",
    signInFailed: "Workbench sign-in failed",
    unknownUser: "Workbench account",
  },
  ja: {
    signIn: "ワークベンチにサインイン",
    signingIn: "ワークベンチにサインイン中",
    checking: "ワークベンチを確認中",
    signedIn: "企業ワークベンチ",
    signedInDescription: "企業アセット領域に接続済み",
    project: "現在のプロジェクト",
    switchProject: "プロジェクトを切り替え",
    noProjects: "アクセス可能なプロジェクトがありません",
    refresh: "更新",
    signOut: "ワークベンチからサインアウト",
    signInFailed: "ワークベンチのサインインに失敗しました",
    unknownUser: "ワークベンチアカウント",
  },
  ko: {
    signIn: "워크벤치 로그인",
    signingIn: "워크벤치 로그인 중",
    checking: "워크벤치 확인 중",
    signedIn: "기업 워크벤치",
    signedInDescription: "기업 자산 공간에 연결됨",
    project: "현재 프로젝트",
    switchProject: "프로젝트 전환",
    noProjects: "접근 가능한 프로젝트가 없습니다",
    refresh: "새로고침",
    signOut: "워크벤치 로그아웃",
    signInFailed: "워크벤치 로그인 실패",
    unknownUser: "워크벤치 계정",
  },
  fr: {
    signIn: "Se connecter à l'espace de travail",
    signingIn: "Connexion à l'espace de travail",
    checking: "Vérification de l'espace de travail",
    signedIn: "Espace de travail d'entreprise",
    signedInDescription: "Connecté à l'espace d'actifs de l'entreprise",
    project: "Projet actuel",
    switchProject: "Changer de projet",
    noProjects: "Aucun projet accessible",
    refresh: "Actualiser",
    signOut: "Se déconnecter de l'espace de travail",
    signInFailed: "Échec de la connexion à l'espace de travail",
    unknownUser: "Compte de l'espace de travail",
  },
  de: {
    signIn: "Beim Workbench anmelden",
    signingIn: "Anmeldung beim Workbench",
    checking: "Workbench wird geprüft",
    signedIn: "Unternehmens-Workbench",
    signedInDescription: "Mit dem Unternehmens-Asset-Bereich verbunden",
    project: "Aktuelles Projekt",
    switchProject: "Projekt wechseln",
    noProjects: "Keine zugänglichen Projekte",
    refresh: "Aktualisieren",
    signOut: "Vom Workbench abmelden",
    signInFailed: "Workbench-Anmeldung fehlgeschlagen",
    unknownUser: "Workbench-Konto",
  },
  es: {
    signIn: "Iniciar sesión en el espacio de trabajo",
    signingIn: "Iniciando sesión en el espacio de trabajo",
    checking: "Comprobando el espacio de trabajo",
    signedIn: "Espacio de trabajo empresarial",
    signedInDescription: "Conectado al espacio de activos de la empresa",
    project: "Proyecto actual",
    switchProject: "Cambiar de proyecto",
    noProjects: "No hay proyectos accesibles",
    refresh: "Actualizar",
    signOut: "Cerrar sesión del espacio de trabajo",
    signInFailed: "Error al iniciar sesión en el espacio de trabajo",
    unknownUser: "Cuenta del espacio de trabajo",
  },
  pt: {
    signIn: "Entrar no espaço de trabalho",
    signingIn: "Entrando no espaço de trabalho",
    checking: "Verificando o espaço de trabalho",
    signedIn: "Espaço de trabalho empresarial",
    signedInDescription: "Conectado ao espaço de ativos da empresa",
    project: "Projeto atual",
    switchProject: "Trocar de projeto",
    noProjects: "Nenhum projeto acessível",
    refresh: "Atualizar",
    signOut: "Sair do espaço de trabalho",
    signInFailed: "Falha ao entrar no espaço de trabalho",
    unknownUser: "Conta do espaço de trabalho",
  },
  ar: {
    signIn: "تسجيل الدخول إلى مساحة العمل",
    signingIn: "جارٍ تسجيل الدخول إلى مساحة العمل",
    checking: "جارٍ التحقق من مساحة العمل",
    signedIn: "مساحة عمل المؤسسة",
    signedInDescription: "متصل بمساحة أصول المؤسسة",
    project: "المشروع الحالي",
    switchProject: "تبديل المشروع",
    noProjects: "لا توجد مشاريع يمكن الوصول إليها",
    refresh: "تحديث",
    signOut: "تسجيل الخروج من مساحة العمل",
    signInFailed: "فشل تسجيل الدخول إلى مساحة العمل",
    unknownUser: "حساب مساحة العمل",
  },
}

function resolveCopy(locale: string): WorkbenchAccountCopy {
  const normalized = locale.toLowerCase()
  if (normalized.startsWith("zh")) {
    return normalized.includes("tw") || normalized.includes("hant")
      ? COPY["zh-TW"]
      : COPY["zh-CN"]
  }
  const prefix = normalized.split("-")[0]
  return COPY[prefix] ?? COPY.en
}

export function WorkbenchAccountButton() {
  const locale = useLocale()
  const copy = useMemo(() => resolveCopy(locale), [locale])
  const workbench = useWorkbenchStore()
  const [opening, setOpening] = useState(false)

  const isBusy =
    opening ||
    workbench.status === "loading" ||
    workbench.status === "signing_in"
  const isConnected = workbench.session.status === "signed_in"
  const hasError = workbench.status === "error"
  const activeProject =
    workbench.session.projects.find(
      (item) => item.projectId === workbench.session.activeProjectId
    ) ?? null

  const statusDotClass = isBusy
    ? "bg-amber-500"
    : hasError
      ? "bg-destructive"
      : isConnected
        ? "bg-sky-500"
        : "bg-muted-foreground/55"

  const handleConnect = useCallback(async () => {
    setOpening(true)
    try {
      await workbench.signIn({ openAuthorizationUrl: openUrl })
    } catch (err) {
      toast.error(copy.signInFailed, { description: toErrorMessage(err) })
    } finally {
      setOpening(false)
    }
  }, [copy, workbench])

  const handleSwitchProject = useCallback(
    async (projectId: string) => {
      try {
        await workbench.selectProject(projectId)
      } catch (err) {
        toast.error(copy.signInFailed, { description: toErrorMessage(err) })
      }
    },
    [copy, workbench]
  )

  const title = isBusy
    ? workbench.status === "loading"
      ? copy.checking
      : copy.signingIn
    : isConnected
      ? copy.signedIn
      : copy.signIn

  if (!isConnected) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "relative h-6 w-6 hover:text-foreground/80",
          hasError && "text-destructive hover:text-destructive"
        )}
        onClick={() => void handleConnect()}
        disabled={isBusy}
        title={title}
        aria-label={title}
      >
        <Building2 className="h-3.5 w-3.5" />
        {isBusy ? (
          <Loader2 className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-spin text-amber-500" />
        ) : (
          <span
            className={cn(
              "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
              statusDotClass
            )}
          />
        )}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-6 w-6 text-sky-600 hover:text-foreground/80"
          title={title}
          aria-label={title}
        >
          <Building2 className="h-3.5 w-3.5" />
          <span
            className={cn(
              "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
              statusDotClass
            )}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="space-y-1">
          <span className="block truncate text-xs font-medium">
            {workbench.session.user?.label || copy.unknownUser}
          </span>
          <span className="block text-xs font-normal text-muted-foreground">
            {copy.signedInDescription}
          </span>
        </DropdownMenuLabel>
        <div className="px-2 py-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{copy.project}</span>
            <span className="min-w-0 truncate font-medium">
              {activeProject?.name ?? workbench.session.activeProjectId}
            </span>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {copy.switchProject}
        </DropdownMenuLabel>
        {workbench.session.projects.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {copy.noProjects}
          </div>
        ) : (
          workbench.session.projects.map((project) => {
            const isActive =
              project.projectId === workbench.session.activeProjectId
            return (
              <DropdownMenuItem
                key={project.projectId}
                onClick={() => void handleSwitchProject(project.projectId)}
                disabled={isActive}
              >
                <Check
                  className={cn(
                    "h-3.5 w-3.5",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
              </DropdownMenuItem>
            )
          })
        )}
        {hasError && workbench.error ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-xs text-destructive">
              {workbench.error}
            </div>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => void workbench.refresh()}
          disabled={isBusy}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isBusy && "animate-spin")} />
          {copy.refresh}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void workbench.signOut()}>
          <LogOut className="h-3.5 w-3.5" />
          {copy.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
