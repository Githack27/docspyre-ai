-- Database functions for Docspyre AI

-- Example function to search document content
CREATE OR REPLACE FUNCTION search_documents(search_query TEXT)
RETURNS TABLE(document_id INT, title VARCHAR, score REAL) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.documentId as document_id, 
        d.title, 
        ts_rank_cd(to_tsvector('english', coalesce(dc.content, '')), plainto_tsquery('english', search_query))::REAL as score
    FROM 
        documents d
    JOIN 
        document_contents dc ON d.documentId = dc.documentId
    WHERE 
        to_tsvector('english', coalesce(dc.content, '')) @@ plainto_tsquery('english', search_query)
    ORDER BY 
        score DESC;
END;
$$ LANGUAGE plpgsql;
