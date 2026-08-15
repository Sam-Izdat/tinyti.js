import { Type } from '../language/frontend/Type';
import { Program } from '../program/Program';
import { product } from '../utils/Utils';
import { Field } from './Field';

export class FieldFactory {
    static createField(type: Type, dimensions: number[], fragmentShaderWritable: boolean = false): Field {
        // Each field gets its OWN SNodeTree. tinyti's partialTree batches
        // consecutive ti.field() calls into a single tree until the next
        // kernel dispatch (materializeCurrentTree). A shared tree has ONE
        // rootBuffer covering all its fields, so destroying any one field
        // (Field.destroy → SNodeTree.destroy) frees the WHOLE buffer — taking
        // sibling fields with it. The app's retire graveyard destroys standing
        // fields two evals after retirement; if one shared a tree with pooled
        // tile buffers, the pooled buffer dies too and its next dispatch
        // throws "couldn't identify resource". Materialize before (flush any
        // pending shared tree) and after (give this field a private tree).
        Program.getCurrentProgram().materializeCurrentTree();
        let field = Program.getCurrentProgram().partialTree.addNaiveDenseField(type, dimensions);
        if (fragmentShaderWritable) {
            field.snodeTree.fragmentShaderWritable = true;
        }
        Program.getCurrentProgram().materializeCurrentTree();
        return field;
    }
}
