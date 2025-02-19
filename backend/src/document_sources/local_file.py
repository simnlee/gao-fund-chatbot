import logging
import shutil
from pathlib import Path
from tempfile import NamedTemporaryFile
from azure.core.credentials import AzureKeyCredential
from langchain_community.document_loaders import AzureAIDocumentIntelligenceLoader
from langchain_core.documents import Document

# Calls Azure Document Intelligence API on PDF file and returns list of paragraphs and list of tables separately in Markdown format
def analyze_pdf_with_azure(pdf_path: str):
    endpoint = config['Azure']['endpoint']
    key = config['Azure']['key']
    
    document_intelligence_client = DocumentIntelligenceClient(endpoint = endpoint, credential = AzureKeyCredential(key))

    with open(pdf_path, "rb") as f:
        poller = document_intelligence_client.begin_analyze_document(
            "prebuilt-layout", analyze_request=f, content_type="application/octet-stream"
        )
    result = poller.result()

    # Extract paragraphs and tables
    paragraphs = []
    tables = []
    for paragraph in result.paragraphs:
        text = paragraph.content
        if has_numbers(text) and len(text.split()) > 5:
            paragraphs.append(text)
    
    for table in result.tables:
        tables.append(azure_table_to_markdown(table))

    return paragraphs, tables

# Returns Azure Document Intelligence Loader
def load_document_content(file_path):
    endpoint = os.environ.get("AZURE_ENDPOINT")
    key = os.environ.get("AZURE_KEY")
    return AzureAIDocumentIntelligenceLoader(
        api_endpoint=endpoint, api_key=key, file_path=file_path, api_model="prebuilt-layout"
    )
    
def get_documents_from_file_by_path(file_path,file_name):
    file_path = Path(file_path)
    if file_path.exists():
        logging.info(f'file {file_name} processing')
        # loader = PyPDFLoader(str(file_path))
        file_extension = file_path.suffix.lower()
        try:
            loader = load_document_content(file_path)
            pages = loader.load()    
        except Exception as e:
            raise Exception('Error while reading the file content or metadata')
    else:
        logging.info(f'File {file_name} does not exist')
        raise Exception(f'File {file_name} does not exist')
    return file_name, pages , file_extension