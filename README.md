# Photosphere 

**By Team FourCast:** Esuru Nanayakkara, Hani Patel, Rafael Carreon, Sophia Kwong

Adviser-facing proof-of-concept for INFOMGMT 399 (Project 2: early-warning tool for student engagement).

## Overview
Photosphere categorizes students into three engagement zones (Calm Orbit, Steady Star, and Solar Flare Zone) using a transparent, rule-based scoring system derived from early-semester engagement data.

* Individual student pages explain in plain language which factors contributed to their zone placement.
* The tool does not make decisions or predict dropouts, it provides insights to help advisers decide appropriate follow-ups.
* All data used in this project is strictly synthetic.
  
### Prerequisites
* VS Code with the **Live Server** extension installed.
  
### Setup & Running
1. Clone the GitHub repository to your local machine. 
2. Open the project directory in VS Code. 
3. Launch the application using VS Code Live Server (e.g., click "Go Live" at the bottom right).
(Note: Opening index.html directly in a browser won't work due to ES module imports.)

### Usage & Data Setup
1. Upload Data: Navigate to the Upload page (index.html) and submit a CSV file.
   * Required CSV Columns: record_id, student_id, student_name, course_code, course_offering_period, week, distinct_logins_per_week, quiz_attempts, avg_days_late, current_grade, prior_gpa, days_since_last_check_in, gender_group, learner_region, age_group, area_deprivation_band, created_at.
   * Data is stored in Supabase (students table). New uploads add missing rows or overwrite duplicates.
3. View Dashboard: Open the dashboard to explore student engagement metrics.

## Pages
- `index.html` (Upload): Upload a new CSV dataset to Supabase or clear existing saved data.
- `dashboard.html`: (Dashboard): Features an interactive zone map with a week selector, highlights "students worth a look,".
- `student.html`: (Student Detail): View specific student profile details for a selected week, including zone badges, key metrics, week-by-week trends, and adviser notes.
