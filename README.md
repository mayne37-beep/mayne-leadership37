# Mayne Leadership · multi-page website

This ZIP contains the complete **first multi-page version** of Mayne Leadership. It is a static website that works without a build step or third-party libraries.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Home |
| `about.html` | About |
| `services.html` | Services |
| `assessments.html` | Assessment directory |
| `leadership-reflection.html` | Working 8-question leadership reflection |
| `tools.html` | Teaching Tools & Resources directory |
| `decision-matrix.html` | Working 3-option weighted decision matrix |
| `testimonials.html` | Testimonials and community (honest placeholders) |
| `contact.html` | Contact (waiting for approved contact channel) |
| `assets/styles.css` | Shared mobile-responsive design |
| `assets/site.js` | Shared navigation and footer script |
| `assets/assessment.js` | Assessment interactions and scoring |
| `assets/matrix.js` | Decision matrix interactions |
| `assets/favicon.svg` | Original minimal site icon |

## Preview on a computer

Extract the ZIP and double-click `index.html`. Keep the `assets` folder alongside the HTML files. Navigation works via relative links. You can also host the extracted folder in any basic local HTTP server.

## Publishing (GitHub → Vercel)

1. Open `https://github.com/mayne37-beep/mayne-leadership37`.
2. Select **Add file → Upload files**. Upload the **contents** of the extracted `mayne-leadership37-site` folder, including all `.html` files and the `assets` folder (preserving its paths).
3. Commit the files to the `main` branch.
4. In Vercel, import `mayne37-beep/mayne-leadership37` as a new project and deploy it. Use **Other** for Framework Preset, and leave build command empty (static HTML).

GitHub and Vercel publishing are **not completed by creating this ZIP**. Permission errors previously prevented publishing from ChatGPT. The ZIP is prepared for manual upload when convenient, including on a computer rather than the phone.

## Current scope and limitations

- The two interactive tools work and require no account. Nothing from either tool is uploaded or stored.
- Leadership reflection is informal, not a validated psychological assessment.
- Cards labeled **Planned** are not yet implemented.
- Testimonials are not invented. The contact page contains no fictional address or nonfunctional contact form.
- Secure member accounts, database storage, and personal dashboards are future phases, not current features.
- Site content and files may be edited and expanded later without changing the overall structure.
