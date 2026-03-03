import { execSync } from 'child_process';

try {
  process.chdir('/vercel/share/v0-project');
  
  console.log('Staging all changes...');
  execSync('git add .', { stdio: 'inherit' });
  
  console.log('Committing changes...');
  execSync('git commit -m "Redesign admin dashboard with role-based personalities\n\n- Super Admin: Linear.app style left sidebar layout\n- School Admin: Duolingo for Schools top tabs layout\n- Add comprehensive CSS design system with admin variables\n- Remove fantasy game elements and banners\n- Add admin-init.js for role detection and layout switching"', { stdio: 'inherit' });
  
  console.log('Pushing to repository...');
  execSync('git push origin HEAD', { stdio: 'inherit' });
  
  console.log('✓ Successfully pushed admin redesign to repository');
} catch (error) {
  console.error('Error during git operations:', error.message);
  process.exit(1);
}
