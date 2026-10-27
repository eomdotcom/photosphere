# Photosphere by FourCast

Adviser-facing proof-of-concept for INFOMGMT 399 (Project 2: early-warning tool for student engagement).

Photosphere places students in three zones (Calm Orbit, Steady Star, Solar Flare Zone) using a
transparent, rule-based score from early-semester engagement data. Each student page explains
in plain language which factors contributed. A light fairness check shows how demographic groups
are spread across zones; demographic fields are never used in the score.

**All data is synthetic.** The tool does not predict dropout or make decisions. Advisers decide
on any follow-up.

## Team
Esuru Nanayakkara, Hani Patel, Rafael Carreon, Sophia Kwong

## Run it
Open the project with VS Code "Go Live" (opening `index.html` directly won't work,
because the scripts are ES modules). Upload a CSV on the Upload page, then open the dashboard.

Data is stored in Supabase (`students` table). Each upload adds new rows or replaces the duplicate rows.
The CSV needs at least `student_id`, `student_name`, `week` and `concern_score` columns.

## Pages
- `index.html`: upload a CSV to Supabase, or delete the saved dataset
- `dashboard.html`: zone map with a week selector built from the `week` column, students worth a look, fairness check
- `student.html`: one student's details for a chosen week, zone badge, key metrics, week-by-week activity and adviser notes
