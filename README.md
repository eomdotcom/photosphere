# Photosphere

**Team FourCast:** Esuru Nanayakkara, Hani Patel, Rafael Carreon, Sophia Kwong

An adviser-facing early-warning dashboard for student engagement, built for INFOMGMT 399 at the University of Auckland.

## Overview
Photosphere sorts students into three zones (**Calm Orbit**, **Steady Star**, and **Solar Flare Zone**) using a transparent, rule-based concern score. It does not make decisions or predict dropouts; it helps advisers identify students who may require proactive outreach.

All data in this project is synthetic.

## Features
- **Upload:** Load weekly student datasets in `.csv` format. Files are validated before anything is saved.
- **Dashboard:** View students across week checkpoints (**Week 1**, **Week 3**, **Week 5**) in either **List** (tabular) or **Planets** (spatial clustering map) view.
- **Zone Filters:** Filter students using **Near a zone line** ($\pm 2$ point boundaries) or **Changed zone** (zone changes from previous week).
- **Student Details:** Inspect individual concern scores, key metric breakdowns, and week-by-week score histories.
- **Case Tracking & Adviser Notes:** Track outreach lifecycle stages (**New**, **Contacted**, **Meeting**, **Support plan**, **Closed**) for Solar Flare Zone students and maintain immutable, timestamped interaction logs.
 

## How It Works
- **Frontend:** HTML, CSS, and JavaScript (ES modules)
- **Database:** Supabase (PostgreSQL)
- **Concern Score:** The concern score ($0\text{--}100$) is calculated in the backend database from grades, GPA, check-ins, logins, lateness, and quiz attempts.
- **Zones:** 30 or below is *Calm Orbit*, above 30 up to 60 is *Steady Star*, and above 60 is *Solar Flare Zone*.


## Getting started
1. **Clone the repository:** Open your computer's **Terminal** (macOS) or **Command Prompt / Git Bash** (Windows), navigate to your desired directory, and run:
   ```bash
   git clone https://github.com/eomdotcom/photosphere.git
   
2. Open the folder in Visual Studio Code.
3. Install the **Live Server** extension in VS Code.
4. Right-click index.html and select **Open with Live Server** (or click **Go Live** in the status bar).

Note: Opening .html files directly via file explorer will fail because the application uses JavaScript ES modules.


## Data format
Sample synthetic data files are provided in the /data directory:
* Week1-synthetic-student data.csv
* Week3-synthetic-student data.csv
* Week5-synthetic-student data.csv

Each CSV needs these header columns (case-sensitive:
`student_id`, `student_name`, `week`, `distinct_logins_per_week`, `quiz_attempts`, `avg_days_late`, `current_grade`, `prior_gpa`, `days_since_last_check_in`

Do not include `concern_score`, because the database calculates it upon upload.

## Limitations
- Data is synthetic, and the score weights and zone cut-offs are provisional.
- There is no adviser login for this prototype. 







