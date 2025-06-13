
import Navbar from '@/components/layout/navbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChartBig, Users, Target, Eye } from 'lucide-react'; // Corrected icon imports

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-secondary/50 flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <section className="text-center mb-16">
          <BarChartBig className="w-20 h-20 text-primary mx-auto mb-6" />
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4 font-headline">
            About codexair
          </h1>
          <p className="text-md sm:text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
            We are dedicated to revolutionizing the code review process through the power of artificial intelligence, helping teams build better, more secure software, faster.
          </p>
        </section>

        <div className="grid md:grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Target className="w-10 h-10 text-primary" />
                <CardTitle className="text-xl md:text-2xl font-headline">Our Mission</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                To empower developers and organizations with cutting-edge AI tools that enhance code quality, bolster security, and provide actionable insights from their codebase. We aim to make advanced code analysis accessible and seamlessly integrated into the development lifecycle.
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Eye className="w-10 h-10 text-primary" />
                <CardTitle className="text-xl md:text-2xl font-headline">Our Vision</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                We envision a future where AI acts as an intelligent partner for every developer, proactively identifying potential issues, suggesting optimal solutions, and fostering a culture of continuous improvement and innovation in software engineering.
              </p>
            </CardContent>
          </Card>
          
          <Card className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader>
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-10 h-10 text-primary" />
                <CardTitle className="text-xl md:text-2xl font-headline">The Team</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                codexair is built by a passionate group of innovators, developers, and AI enthusiasts committed to solving real-world challenges in software development. We believe in collaboration, excellence, and the transformative potential of AI. (More details about the team coming soon!)
              </p>
            </CardContent>
          </Card>
        </div>
        
        <section className="mt-16 text-center">
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mb-4 font-headline">Get In Touch</h2>
            <p className="text-muted-foreground mb-6">
                Have questions or want to learn more? We&apos;d love to hear from you.
            </p>
            <p className="text-muted-foreground">
                (Contact information or a contact form placeholder will be here.)
            </p>
        </section>

      </main>
      <footer className="py-10 text-center text-sm text-muted-foreground border-t bg-background">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} codexair. All rights reserved.</p>
          <p className="mt-1">Empowering developers with AI-driven code intelligence.</p>
        </div>
      </footer>
    </div>
  );
}
