### Neo4j Database
There is a Neo4j AuraDB account already associated with associates@gao-cap.com. Just go to [the website](https://neo4j.com/cloud/platform/aura-graph-database/) and login with Google. The instance credentials are already in the .env file in the backend/ folder. If you have to update the instance details, just update the .env file. 

### Setup
1. Install all requirements in "backend/requirements.txt". Compatible with up to Python 3.9.
2. Setup synced Google Drive folder containing PDFs filtered and downloaded from research@gao-cap.com using [Fund Email Crawler](https://github.com/simnlee/fund-email-crawler).

Backend:
4. Create the backend/.env file by copy/pasting the backend/example.env.
5. Change values as needed
6.
    ```bash
    cd backend
    uvicorn score:app --reload
    ```
    
- For the frontend:
7. Create the frontend/.env file by copy/pasting the frontend/example.env.
8. Change values as needed
9.
    ```bash
    cd frontend
    yarn
    yarn run dev
    ```
10. Select synced Google Drive folder to add new documents to graph. 

### About
* Azure Document Intelligence API to parse text and tables
* Neo4j to index data in knowledge graph format
* Langchain to orchestrate LLMs
