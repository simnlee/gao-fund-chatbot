from langchain_community.graphs import Neo4jGraph
from src.diffbot_transformer import get_graph_from_diffbot
from src.openAI_llm import get_graph_from_OpenAI
from src.gemini_llm import get_graph_from_Gemini
from typing import List
import logging
from src.shared.constants import *
import os
from src.llm import get_graph_from_llm

logging.basicConfig(format="%(asctime)s - %(message)s", level="INFO")


def generate_graphDocuments(model: str, graph: Neo4jGraph, chunkId_chunkDoc_list: List, allowedNodes=None, allowedRelationship=None):
    
    if  allowedNodes is None or allowedNodes=="":
        allowedNodes =[]
    else:
        allowedNodes = allowedNodes.split(',')    
    if  allowedRelationship is None or allowedRelationship=="":   
        allowedRelationship=[]
    else:
        allowedRelationship = allowedRelationship.split(',')
    
    logging.info(f"allowedNodes: {allowedNodes}, allowedRelationship: {allowedRelationship}")

    graph_documents = []
    graph_documents = get_graph_from_OpenAI(model, graph, chunkId_chunkDoc_list, allowedNodes, allowedRelationship)

    logging.info(f"graph_documents = {len(graph_documents)}")
    return graph_documents
