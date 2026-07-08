export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex flex-col md:flex-row justify-between gap-10 mb-10">
          <div className="max-w-xs">
            <a href="/" className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full border-2 border-primary" />
              <span className="text-lg font-bold tracking-wider">
                <span className="text-primary">VO</span>
                <span className="text-text-primary">SIL</span>
              </span>
            </a>
            <p className="text-sm text-text-secondary leading-relaxed">
              Advanced conversational AI for everyone.
            </p>
          </div>

          <div className="flex gap-10 sm:gap-16 flex-wrap">
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-4">
                Product
              </h4>
              <div className="flex flex-col gap-3">
                <a
                  href="#features"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                >
                  Features
                </a>
                <a
                  href="#demo"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                >
                  Demo
                </a>
                <a
                  href="/chat"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                >
                  Start Chatting
                </a>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary mb-4">
                Legal
              </h4>
              <div className="flex flex-col gap-3">
                <a
                  href="#"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                >
                  Privacy Policy
                </a>
                <a
                  href="#"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                >
                  Terms of Service
                </a>
                <a
                  href="#"
                  className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-200"
                >
                  Contact
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border text-center text-sm text-text-muted">
          &copy; 2026 VOSIL. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
