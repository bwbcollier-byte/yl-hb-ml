const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function getColumns() {
  try {
    console.log('🔍 Fetching talent_profiles column schema...\n');
    
    // Query information_schema for columns
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', 'talent_profiles')
      .eq('table_schema', 'public')
      .order('ordinal_position');
    
    if (error) {
      console.error('❌ Error:', error.message);
      return;
    }

    if (data && data.length > 0) {
      console.log('✅ Columns in talent_profiles:\n');
      data.forEach(col => {
        const nullable = col.is_nullable === 'YES' ? '(nullable)' : '(required)';
        console.log(`  - ${col.column_name}: ${col.data_type} ${nullable}`);
      });
    } else {
      console.log('No columns found or table does not exist');
    }
  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

getColumns();
