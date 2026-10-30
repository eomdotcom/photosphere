# Photosphere

**Team FourCast:** Esuru Nanayakkara, Hani Patel, Rafael Carreon, Sophia Kwong

An adviser-facing early-warning dashboard for student engagement, built for INFOMGMT 399 at the University of Auckland.

## Overview
Photosphere sorts students into three zones (**Calm Orbit**, **Steady Star** and **Solar Flare Zone**) using a transparent, rule-based concern score. It does not make decisions or predict dropouts. It helps advisers see where a closer look may be needed.

All data in this project is synthetic.

## Features
- **Upload:** add one CSV per week. Files are checked before anything is saved.
- **Dashboard:** view students by week as a list or as planets, and filter for those near a zone line or who changed zone.
- **Student details:** concern score, key metrics and week-by-week history.
- **Case tracking and adviser notes:** follow up on Solar Flare Zone students and keep a record of each interaction.

## How it works
- **Frontend:** HTML, CSS and JavaScript
- **Database:** Supabase (PostgreSQL)
- The **concern score** (0–100) is calculated in the database from grades, GPA, check-ins, logins, lateness and quiz attempts.
- **Zones:** 30 or below is Calm Orbit, above 30 up to 60 is Steady Star, and above 60 is Solar Flare Zone.

## Getting started
1. Clone the repository and open the folder in VS Code.
2. Install the **Live Server** extension.
3. Click **Go Live** to open the app.

Opening the HTML files directly in a browser won't work, because the pages use JavaScript modules.

## Data format
Each CSV needs these columns:
`student_id`, `student_name`, `week`, `distinct_logins_per_week`, `quiz_attempts`, `avg_days_late`, `current_grade`, `prior_gpa`, `days_since_last_check_in`

Do not include `concern_score`, because the database calculates it.

## Limitations
- Data is synthetic, and the score weights and zone cut-offs are provisional.
- There is no adviser login yet. A production version would add authentication and role-based access.
