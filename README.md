# Building Plan Compliance Analysis SaaS

AI-powered building plan compliance analysis platform built with Next.js, Supabase, and n8n.

## Kenyan document library

Open `/dashboard/library`, or choose **Docs & codes** in the dashboard navigation.
This is a standalone reference library, separate from project analyses. Signed-in
users can select national and Nairobi documents, search their text, and follow
citations to the original PDF pages. Earlier answers retain their own references.
Conversations are held in page memory and are cleared when the page is left.

The checked-in `data/kenya-library.json` index contains page-scoped text from the
PDFs in `reference-documents/kenya`. Normal builds need no extraction or AI key.
Search mode shows matching passages explicitly, without generating legal advice.
The scanned Nairobi regularization Act is listed but excluded from retrieval until
OCR is available. Partially extracted documents show page coverage. Historical and
mirror copies are labelled and excluded from the default selection. The corpus is
a dated collection, not a live check of amendments or legal applicability.

To enable conversational answers, set these **server-only** environment variables
in `.env.local` or the deployment environment and redeploy:

```env
GEMINI_API_KEY=your-server-side-key
GEMINI_MODEL=your-enabled-gemini-model-id
```

Use a model supporting `generateContent` structured JSON output. The server sends
the question, up to four earlier questions in the same document scope, and up to
eight retrieved passages to Gemini. It accepts only citation IDs in those passages;
source URLs and page numbers come from the index, not model output. An unavailable
provider or invalid citation response falls back to labelled document search.
This connection is independent of the n8n project-analysis workflow. See Google's
[generation API](https://ai.google.dev/api/generate-content) and
[structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).

Rebuild and verify the index after updating downloaded PDFs and their manifests:

```bash
npm ci --prefix scratch/browser-testing
node scratch/browser-testing/index-library.cjs
node scratch/browser-testing/library-regression.cjs
```

The index builder verifies each PDF's manifest SHA-256 and preserves one-based
original PDF page positions. It does not infer printed page numbers or perform OCR.
Review extracted tables and diagrams against the original documents before relying
on an interpretation. The PDF corpus and generated index must be updated together.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd "UILDING PLAN COMPLIANCE ANALYSIS SaaS"
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**

Copy the example environment file:
```bash
cp .env.example .env.local
```

Then edit `.env.local` and add your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

> **Important**: Never commit `.env.local` to version control. It's already in `.gitignore`.

4. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## 📦 Deployment

### Deploying to Vercel

1. Push your code to GitHub (without `.env.local`)
2. Import your repository in Vercel
3. Add environment variables in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add `NEXT_PUBLIC_SUPABASE_URL`
   - Add `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy!

### Deploying to Other Platforms

For other platforms (Netlify, Railway, etc.), add the same environment variables in their respective dashboards.

## 🔐 Security Notes

- **Never commit** `.env.local` or any file containing secrets
- The `.env.example` file is safe to commit (contains no real credentials)
- Supabase anon keys are safe to expose in client-side code (they have Row Level Security)
- For production, consider using Supabase's service role key only on the server side

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS, shadcn/ui
- **Backend**: Supabase (Auth, Database, Storage)
- **Workflow**: n8n
- **Forms**: React Hook Form + Zod
- **State**: TanStack Query + Zustand

## 📁 Project Structure

```
├── app/
│   ├── (auth)/          # Authentication pages
│   ├── layout.tsx       # Root layout
│   └── globals.css      # Global styles
├── components/
│   ├── auth/            # Auth components
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── supabase/        # Supabase clients
│   └── utils.ts         # Utility functions
└── types/               # TypeScript types
```

## 🎨 Features

- ✅ Authentication (Login, Signup, Password Reset)
- ✅ Blueprint-style UI design
- ✅ Form validation
- ✅ Responsive design
- 🚧 Dashboard (coming soon)
- 🚧 Project management (coming soon)
- 🚧 AI analysis workflow (coming soon)

## 📝 License

MIT
