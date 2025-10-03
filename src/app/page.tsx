import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Shield, GraduationCap, BookOpen, Eye, Github } from "lucide-react"

export default function Home() {
  const features = [
    {
      title: "원장 대시보드",
      description: "모든 권한 보유, 다른 대시보드 이동 가능",
      icon: Shield,
      color: "bg-purple-100 text-purple-800"
    },
    {
      title: "실장 대시보드", 
      description: "가입 권한 관리, 역할 부여/해제, 반 관리",
      icon: Users,
      color: "bg-blue-100 text-blue-800"
    },
    {
      title: "선생님 대시보드",
      description: "추후 업데이트 예정",
      icon: GraduationCap,
      color: "bg-green-100 text-green-800"
    },
    {
      title: "학생 대시보드",
      description: "모바일 위주, 추후 업데이트 예정", 
      icon: BookOpen,
      color: "bg-yellow-100 text-yellow-800"
    }
  ]

  const techStack = [
    { name: "Next.js 15", description: "React Framework" },
    { name: "Supabase", description: "Backend & Auth" },
    { name: "Tailwind CSS", description: "Styling" },
    { name: "shadcn/ui", description: "UI Components" }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            학습관리 플랫폼
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            권한별 대시보드를 제공하는 현대적인 학습관리 시스템
          </p>
          <div className="space-x-4">
            <Button asChild size="lg">
              <Link href="/demo">
                <Eye className="mr-2 h-5 w-5" />
                컴포넌트 데모 보기
              </Link>
            </Button>
            <Button variant="outline" size="lg">
              <Github className="mr-2 h-5 w-5" />
              GitHub
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
            권한별 대시보드
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader className="text-center">
                  <feature.icon className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <Badge className={`${feature.color} mb-3`}>
                    {feature.title.split(" ")[0]}
                  </Badge>
                  <p className="text-sm text-gray-600">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Tech Stack */}
        <div className="mb-16">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-8">
            기술 스택
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
            {techStack.map((tech, index) => (
              <Card key={index} className="text-center p-4">
                <CardContent className="pt-2">
                  <div className="font-semibold text-gray-900">{tech.name}</div>
                  <div className="text-sm text-gray-600">{tech.description}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Section */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
          <CardContent className="text-center p-8">
            <h3 className="text-2xl font-bold mb-4">컴포넌트 데모 체험하기</h3>
            <p className="mb-6 opacity-90">
              실제 구현된 컴포넌트들을 미리 체험해보세요
            </p>
            <Button asChild size="lg" variant="secondary">
              <Link href="/demo">
                데모 페이지로 이동
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-gray-400">
            © 2024 학습관리 플랫폼. Next.js + Supabase + shadcn/ui로 제작
          </p>
        </div>
      </footer>
    </div>
  )
}
